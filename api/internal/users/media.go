package users

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgtype"
	"pulse-api/internal/media"
)

const (
	maxAvatarBytes = 2 << 20
	avatarPrefix   = "avatars/"
)

var avatarObjectName = regexp.MustCompile(`^[0-9a-f]{32}\.(jpg|png|webp)$`)

// HandleUploadAvatar stores a profile photo in the same private S3 bucket as event media.
func (h *Handler) HandleUploadAvatar(w http.ResponseWriter, r *http.Request) {
	bucket := os.Getenv("S3_BUCKET")
	publicAPIURL := strings.TrimRight(os.Getenv("PUBLIC_API_URL"), "/")
	if bucket == "" || publicAPIURL == "" {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Incarcarea imaginilor nu este configurata")
		return
	}

	userID, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return
	}

	var userUUID pgtype.UUID
	if err := userUUID.Scan(userID); err != nil || !userUUID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID utilizator invalid")
		return
	}
	_, err = h.Queries.GetUserByID(r.Context(), userUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Utilizatorul nu a fost gasit")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxAvatarBytes)
	imageData, err := io.ReadAll(r.Body)
	if err != nil {
		router.RespondWithError(w, http.StatusRequestEntityTooLarge, "Poza de profil trebuie sa aiba cel mult 2 MB")
		return
	}
	if len(imageData) == 0 {
		router.RespondWithError(w, http.StatusBadRequest, "Selecteaza o imagine")
		return
	}

	contentType, extension, ok := avatarImageType(imageData)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "Sunt acceptate doar imagini JPEG, PNG sau WebP")
		return
	}

	objectID, err := randomAvatarObjectID()
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut pregati imaginea")
		return
	}
	key := fmt.Sprintf("%s%s/%s.%s", avatarPrefix, userID, objectID, extension)

	storage, err := media.Client(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut initializa stocarea imaginilor")
		return
	}
	// Register cleanup before upload, so a crash cannot leave an untracked object.
	if _, err = h.DB.Exec(r.Context(), `INSERT INTO user_media_deletion_jobs (object_key, next_attempt_at) VALUES ($1, clock_timestamp() + interval '1 hour')`, key); err != nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Imaginea nu a putut fi pregatita")
		return
	}
	if _, err = storage.PutObject(r.Context(), &s3.PutObjectInput{
		Bucket:       aws.String(bucket),
		Key:          aws.String(key),
		Body:         bytes.NewReader(imageData),
		ContentType:  aws.String(contentType),
		CacheControl: aws.String("public, max-age=31536000, immutable"),
	}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Poza de profil nu a putut fi incarcata")
		return
	}

	avatarURL := fmt.Sprintf("%s/api/v1/media/%s", publicAPIURL, key)
	updated, err := h.replaceAvatar(r.Context(), userUUID, avatarURL, key)
	if err != nil {
		// The pre-registered job cleans up the upload after a failed transaction.
		router.RespondWithError(w, http.StatusInternalServerError, "Poza de profil nu a putut fi salvata")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapUser(updated))
}

func ownedAvatarKey(rawURL, userID string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") {
		return ""
	}
	prefix := "/api/v1/media/" + avatarPrefix + userID + "/"
	if !strings.HasPrefix(parsed.Path, prefix) {
		return ""
	}
	name := strings.TrimPrefix(parsed.Path, prefix)
	if !avatarObjectName.MatchString(name) {
		return ""
	}
	return avatarPrefix + userID + "/" + name
}

func avatarImageType(imageData []byte) (contentType, extension string, ok bool) {
	switch http.DetectContentType(imageData) {
	case "image/jpeg":
		return "image/jpeg", "jpg", true
	case "image/png":
		return "image/png", "png", true
	case "image/webp":
		return "image/webp", "webp", true
	default:
		return "", "", false
	}
}

func randomAvatarObjectID() (string, error) {
	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(randomBytes), nil
}

// Swap the URL and schedule cleanup under one row lock. Concurrent uploads
// delete the actual replaced image, never the image still referenced by users.
func (h *Handler) replaceAvatar(ctx context.Context, userID pgtype.UUID, avatarURL, newKey string) (db.Users, error) {
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return db.Users{}, err
	}
	defer tx.Rollback(ctx)
	var previous pgtype.Text
	if err := tx.QueryRow(ctx, "SELECT avatar_url FROM users WHERE id=$1 FOR UPDATE", userID).Scan(&previous); err != nil {
		return db.Users{}, err
	}
	updated, err := h.Queries.WithTx(tx).UpdateUserAvatar(ctx, db.UpdateUserAvatarParams{ID: userID, AvatarUrl: pgtype.Text{String: avatarURL, Valid: true}})
	if err != nil {
		return db.Users{}, err
	}
	if key := ownedAvatarKey(previous.String, userID.String()); key != "" && key != newKey {
		if _, err := tx.Exec(ctx, "INSERT INTO user_media_deletion_jobs (object_key,next_attempt_at) VALUES ($1,$2) ON CONFLICT (object_key) DO NOTHING", key, time.Now().Add(15*time.Minute)); err != nil {
			return db.Users{}, err
		}
	}
	if _, err := tx.Exec(ctx, "DELETE FROM user_media_deletion_jobs WHERE object_key=$1", newKey); err != nil {
		return db.Users{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.Users{}, err
	}
	return updated, nil
}
