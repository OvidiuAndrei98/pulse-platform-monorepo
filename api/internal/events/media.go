package events

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"pulse-api/internal/auth"
	"pulse-api/internal/router"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

const (
	maxEventBannerBytes = 5 << 20
	eventBannerPrefix   = "events/"
)

func (h *Handler) HandleUploadEventBanner(w http.ResponseWriter, r *http.Request) {
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

	r.Body = http.MaxBytesReader(w, r.Body, maxEventBannerBytes)
	imageData, err := io.ReadAll(r.Body)
	if err != nil {
		router.RespondWithError(w, http.StatusRequestEntityTooLarge, "Imaginea trebuie sa aiba cel mult 5 MB")
		return
	}
	if len(imageData) == 0 {
		router.RespondWithError(w, http.StatusBadRequest, "Selecteaza o imagine")
		return
	}

	contentType, extension, ok := eventImageType(imageData)
	if !ok {
		router.RespondWithError(w, http.StatusBadRequest, "Sunt acceptate doar imagini JPEG, PNG sau WebP")
		return
	}

	objectID, err := randomObjectID()
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut pregati imaginea")
		return
	}
	key := fmt.Sprintf("%s%s/%s.%s", eventBannerPrefix, userID, objectID, extension)

	awsCfg, err := awsconfig.LoadDefaultConfig(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut initializa stocarea imaginilor")
		return
	}

	_, err = s3.NewFromConfig(awsCfg).PutObject(r.Context(), &s3.PutObjectInput{
		Bucket:       aws.String(bucket),
		Key:          aws.String(key),
		Body:         bytes.NewReader(imageData),
		ContentType:  aws.String(contentType),
		CacheControl: aws.String("public, max-age=31536000, immutable"),
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Imaginea nu a putut fi incarcata")
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, map[string]string{
		"url": fmt.Sprintf("%s/api/v1/media/%s", publicAPIURL, key),
	})
}

func (h *Handler) HandleGetEventBanner(w http.ResponseWriter, r *http.Request) {
	bucket := os.Getenv("S3_BUCKET")
	key := strings.TrimPrefix(chi.URLParam(r, "*"), "/")
	if bucket == "" || !strings.HasPrefix(key, eventBannerPrefix) {
		http.NotFound(w, r)
		return
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(r.Context())
	if err != nil {
		http.NotFound(w, r)
		return
	}

	object, err := s3.NewFromConfig(awsCfg).GetObject(r.Context(), &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer object.Body.Close()

	if object.ContentType != nil {
		w.Header().Set("Content-Type", *object.ContentType)
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	_, _ = io.Copy(w, object.Body)
}

func eventImageType(imageData []byte) (contentType, extension string, ok bool) {
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

func randomObjectID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
