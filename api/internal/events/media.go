package events

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	maxEventBannerBytes     = 5 << 20
	maxOrganizerUpdateBytes = 2 << 20
	eventBannerPrefix       = "events/"
	avatarPrefix            = "avatars/"
	organizerUpdatePrefix   = "organizer-updates/"
	eventBannerOrphanGrace  = 72 * time.Hour
	eventBannerRetryDelay   = 15 * time.Minute
	maxBannerDeletesPerTick = 10
)

var errEventBannerAssetUnavailable = errors.New("event banner asset is unavailable")

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
	var ownerID pgtype.UUID
	if err := ownerID.Scan(userID); err != nil || !ownerID.Valid {
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
	asset, err := h.Queries.CreatePendingEventBannerAsset(r.Context(), db.CreatePendingEventBannerAssetParams{
		OwnerID: ownerID,
		S3Key:   key,
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Imaginea nu a putut fi inregistrata")
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
		// Keep the pending row. The GC worker removes a possibly successful but
		// unacknowledged S3 upload only after a 24-hour safety interval.
		router.RespondWithError(w, http.StatusInternalServerError, "Imaginea nu a putut fi incarcata")
		return
	}
	rowsAffected, err := h.Queries.MarkEventBannerAssetReady(r.Context(), db.MarkEventBannerAssetReadyParams{
		ID:          asset.ID,
		OwnerID:     ownerID,
		DeleteAfter: pgtype.Timestamptz{Time: time.Now().Add(eventBannerOrphanGrace), Valid: true},
	})
	if err != nil || rowsAffected != 1 {
		router.RespondWithError(w, http.StatusInternalServerError, "Imaginea a fost incarcata, dar nu a putut fi finalizata")
		return
	}

	router.RespondWithJSON(w, http.StatusCreated, map[string]string{
		"url": fmt.Sprintf("%s/api/v1/media/%s", publicAPIURL, key),
	})
}

func (h *Handler) HandleGetEventBanner(w http.ResponseWriter, r *http.Request) {
	bucket := os.Getenv("S3_BUCKET")
	key := strings.TrimPrefix(chi.URLParam(r, "*"), "/")
	if bucket == "" || (!strings.HasPrefix(key, eventBannerPrefix) && !strings.HasPrefix(key, avatarPrefix) && !strings.HasPrefix(key, organizerUpdatePrefix)) {
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
	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(randomBytes), nil
}

func ownedEventBannerKey(bannerURL, ownerID string) (string, bool) {
	if bannerURL == "" || ownerID == "" {
		return "", false
	}

	publicAPIURL := strings.TrimRight(os.Getenv("PUBLIC_API_URL"), "/")
	baseURL, err := url.Parse(publicAPIURL)
	if err != nil || baseURL.Host == "" {
		return "", false
	}

	parsedBannerURL, err := url.Parse(bannerURL)
	if err != nil || parsedBannerURL.Scheme != baseURL.Scheme || parsedBannerURL.Host != baseURL.Host ||
		parsedBannerURL.User != nil || parsedBannerURL.RawQuery != "" || parsedBannerURL.Fragment != "" || parsedBannerURL.RawPath != "" {
		return "", false
	}

	pathPrefix := strings.TrimRight(baseURL.Path, "/") + "/api/v1/media/" + eventBannerPrefix + ownerID + "/"
	if !strings.HasPrefix(parsedBannerURL.Path, pathPrefix) {
		return "", false
	}

	filename := strings.TrimPrefix(parsedBannerURL.Path, pathPrefix)
	parts := strings.Split(filename, ".")
	if len(parts) != 2 || len(parts[0]) != 32 || strings.Trim(parts[0], "0123456789abcdef") != "" ||
		(parts[1] != "jpg" && parts[1] != "png" && parts[1] != "webp") {
		return "", false
	}
	return eventBannerPrefix + ownerID + "/" + filename, true
}

func currentEventBannerAsset(ctx context.Context, queries *db.Queries, eventID pgtype.UUID) (pgtype.UUID, error) {
	assetID, err := queries.GetEventBannerReference(ctx, eventID)
	if errors.Is(err, pgx.ErrNoRows) {
		return pgtype.UUID{}, nil
	}
	return assetID, err
}

// claimEventBannerAsset locks current and next assets in stable UUID order.
// The caller must run this inside the same transaction that updates the event.
func claimEventBannerAsset(ctx context.Context, queries *db.Queries, ownerID, currentAssetID pgtype.UUID, bannerURL string) (pgtype.UUID, error) {
	var nextAssetID pgtype.UUID
	var key string
	if bannerURL != "" {
		var ok bool
		key, ok = ownedEventBannerKey(bannerURL, ownerID.String())
		if !ok {
			return pgtype.UUID{}, errEventBannerAssetUnavailable
		}
		var err error
		nextAssetID, err = queries.FindReadyEventBannerAsset(ctx, db.FindReadyEventBannerAssetParams{OwnerID: ownerID, S3Key: key})
		if errors.Is(err, pgx.ErrNoRows) {
			return pgtype.UUID{}, errEventBannerAssetUnavailable
		}
		if err != nil {
			return pgtype.UUID{}, err
		}
	}

	first, second := currentAssetID, nextAssetID
	if !first.Valid {
		first = second
	}
	if !second.Valid {
		second = first
	}
	if first.Valid {
		locked, err := queries.LockEventBannerAssetPair(ctx, db.LockEventBannerAssetPairParams{ID: first, ID_2: second})
		if err != nil {
			return pgtype.UUID{}, err
		}
		expected := 1
		if first != second {
			expected = 2
		}
		if len(locked) != expected {
			return pgtype.UUID{}, errEventBannerAssetUnavailable
		}
	}
	if nextAssetID.Valid {
		rowsAffected, err := queries.ActivateReadyEventBannerAsset(ctx, db.ActivateReadyEventBannerAssetParams{
			ID: nextAssetID, OwnerID: ownerID, S3Key: key,
		})
		if err != nil {
			return pgtype.UUID{}, err
		}
		if rowsAffected != 1 {
			return pgtype.UUID{}, errEventBannerAssetUnavailable
		}
	}
	return nextAssetID, nil
}

func applyEventBannerReference(ctx context.Context, queries *db.Queries, eventID, currentAssetID, nextAssetID pgtype.UUID) error {
	if nextAssetID.Valid {
		if err := queries.UpsertEventBannerReference(ctx, db.UpsertEventBannerReferenceParams{EventID: eventID, AssetID: nextAssetID}); err != nil {
			return err
		}
	} else if err := queries.DeleteEventBannerReference(ctx, eventID); err != nil {
		return err
	}
	if currentAssetID.Valid && currentAssetID != nextAssetID {
		_, err := queries.ScheduleEventBannerAssetDeletionIfUnreferenced(ctx, db.ScheduleEventBannerAssetDeletionIfUnreferencedParams{
			ID: currentAssetID, DeleteAfter: pgtype.Timestamptz{Time: time.Now().Add(eventBannerOrphanGrace), Valid: true},
		})
		return err
	}
	return nil
}

func deleteStoredEventBanner(ctx context.Context, key string) error {
	bucket := os.Getenv("S3_BUCKET")
	if bucket == "" {
		return errors.New("S3_BUCKET is not configured")
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return err
	}
	_, err = s3.NewFromConfig(awsCfg).DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	return err
}

// cleanupDueEventBanners is gated at the caller during deployment. The
// delete function is injectable so crash/retry behavior can be tested without S3.
func (h *Handler) cleanupDueEventBanners(ctx context.Context, deleteObject func(context.Context, string) error) error {
	for count := 0; count < maxBannerDeletesPerTick; count++ {
		asset, err := h.Queries.ClaimDueEventBannerAssetDeletion(ctx)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if err := deleteObject(ctx, asset.S3Key); err != nil {
			_, recordErr := h.Queries.RecordEventBannerAssetDeletionFailure(ctx, db.RecordEventBannerAssetDeletionFailureParams{
				ID: asset.ID, DeletionLeaseID: asset.DeletionLeaseID,
				LastError:              pgtype.Text{String: "object deletion failed", Valid: true},
				DeletionLeaseExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(eventBannerRetryDelay), Valid: true},
			})
			if recordErr != nil {
				return recordErr
			}
			log.Printf("event banner deletion failed for asset %s", asset.ID.String())
			continue
		}
		rowsAffected, err := h.Queries.CompleteEventBannerAssetDeletion(ctx, db.CompleteEventBannerAssetDeletionParams{
			ID: asset.ID, DeletionLeaseID: asset.DeletionLeaseID,
		})
		if err != nil {
			return err
		}
		if rowsAffected != 1 {
			log.Printf("event banner deletion completion fenced for asset %s", asset.ID.String())
		}
	}
	return nil
}
