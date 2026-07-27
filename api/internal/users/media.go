package users

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	maxAvatarBytes = 2 << 20
	avatarPrefix   = "avatars/"
)

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

	awsCfg, err := awsconfig.LoadDefaultConfig(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut initializa stocarea imaginilor")
		return
	}
	storage := s3.NewFromConfig(awsCfg)
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
	updated, err := h.Queries.UpdateUserAvatar(r.Context(), db.UpdateUserAvatarParams{
		ID:        userUUID,
		AvatarUrl: pgtype.Text{String: avatarURL, Valid: true},
	})
	if err != nil {
		_, _ = storage.DeleteObject(r.Context(), &s3.DeleteObjectInput{
			Bucket: aws.String(bucket),
			Key:    aws.String(key),
		})
		router.RespondWithError(w, http.StatusInternalServerError, "Poza de profil nu a putut fi salvata")
		return
	}

	router.RespondWithJSON(w, http.StatusOK, MapUser(updated))
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
