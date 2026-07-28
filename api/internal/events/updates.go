package events

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/organizer"
	"pulse-api/internal/router"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const maxActiveOrganizerUpdates = 3

type createEventUpdateRequest struct {
	ImageURL string `json:"imageUrl"`
	Caption  string `json:"caption"`
}

type OrganizerEventUpdateResponse struct {
	ID          string `json:"id"`
	EventID     string `json:"eventId"`
	OrganizerID string `json:"organizerId"`
	EventTitle  string `json:"eventTitle"`
	ImageURL    string `json:"imageUrl"`
	Caption     string `json:"caption,omitempty"`
	CreatedAt   string `json:"createdAt"`
	ExpiresAt   string `json:"expiresAt"`
}

func organizerUpdateIDs(w http.ResponseWriter, r *http.Request) (pgtype.UUID, pgtype.UUID, bool) {
	userIDString, err := auth.GetUserIDFromContext(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}

	var userID, eventID pgtype.UUID
	if err := userID.Scan(userIDString); err != nil || !userID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID organizator invalid")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return pgtype.UUID{}, pgtype.UUID{}, false
	}
	return userID, eventID, true
}

func (h *Handler) HandleUploadOrganizerUpdateImage(w http.ResponseWriter, r *http.Request) {
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
	var organizerID pgtype.UUID
	if err := organizerID.Scan(userID); err != nil || !organizerID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID organizator invalid")
		return
	}
	profile, err := h.Queries.GetOrganizerProfile(r.Context(), organizerID)
	if err != nil || !organizer.IsVerified(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Doar organizatorii verificati pot publica update-uri")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxOrganizerUpdateBytes)
	imageData, err := io.ReadAll(r.Body)
	if err != nil {
		router.RespondWithError(w, http.StatusRequestEntityTooLarge, "Imaginea trebuie sa aiba cel mult 2 MB")
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
	key := fmt.Sprintf("%s%s/%s.%s", organizerUpdatePrefix, userID, objectID, extension)
	awsCfg, err := awsconfig.LoadDefaultConfig(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut initializa stocarea imaginilor")
		return
	}
	if _, err = s3.NewFromConfig(awsCfg).PutObject(r.Context(), &s3.PutObjectInput{
		Bucket: aws.String(bucket), Key: aws.String(key), Body: bytes.NewReader(imageData),
		ContentType: aws.String(contentType), CacheControl: aws.String("public, max-age=31536000, immutable"),
	}); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Imaginea nu a putut fi incarcata")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, map[string]string{"url": fmt.Sprintf("%s/api/v1/media/%s", publicAPIURL, key)})
}

func (h *Handler) HandleCreateEventUpdate(w http.ResponseWriter, r *http.Request) {
	userID, eventID, ok := organizerUpdateIDs(w, r)
	if !ok {
		return
	}
	var req createEventUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Date invalide pentru update")
		return
	}
	req.ImageURL = strings.TrimSpace(req.ImageURL)
	req.Caption = strings.TrimSpace(req.Caption)
	if req.ImageURL == "" || !isOwnedOrganizerUpdateURL(req.ImageURL, common.UUIDToString(userID)) {
		router.RespondWithError(w, http.StatusBadRequest, "Imaginea update-ului este invalida")
		return
	}
	if len([]rune(req.Caption)) > 160 {
		router.RespondWithError(w, http.StatusBadRequest, "Descrierea poate avea cel mult 160 de caractere")
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Update-ul nu a putut fi creat")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)
	if err := qtx.LockOrganizerEventUpdates(r.Context(), common.UUIDToString(userID)); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Update-ul nu a putut fi creat")
		return
	}
	profile, err := qtx.GetOrganizerProfile(r.Context(), userID)
	if err != nil || !organizer.IsVerified(profile) {
		router.RespondWithError(w, http.StatusForbidden, "Doar organizatorii verificati pot publica update-uri")
		return
	}
	event, err := qtx.GetEventForOrganizerUpdate(r.Context(), eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusNotFound, "Evenimentul nu a fost gasit")
		return
	}
	if event.OrganizerID != userID {
		router.RespondWithError(w, http.StatusForbidden, "Nu ai permisiunea sa publica update-uri pentru acest eveniment")
		return
	}
	if event.Status != "published" || !event.EndTime.Valid || !event.EndTime.Time.After(time.Now()) {
		router.RespondWithError(w, http.StatusConflict, "Update-urile sunt disponibile doar pentru evenimente publicate si nefinalizate")
		return
	}
	count, err := qtx.CountActiveOrganizerUpdates(r.Context(), userID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Update-urile nu au putut fi verificate")
		return
	}
	if count >= maxActiveOrganizerUpdates {
		router.RespondWithError(w, http.StatusConflict, "Poti avea cel mult 3 update-uri active")
		return
	}
	created, err := qtx.CreateEventUpdate(r.Context(), db.CreateEventUpdateParams{
		EventID: eventID, OrganizerID: userID, ImageUrl: req.ImageURL,
		Caption: pgtype.Text{String: req.Caption, Valid: req.Caption != ""},
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Update-ul nu a putut fi creat")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Update-ul nu a putut fi creat")
		return
	}
	router.RespondWithJSON(w, http.StatusCreated, OrganizerEventUpdateResponse{
		ID: created.ID.String(), EventID: created.EventID.String(), OrganizerID: created.OrganizerID.String(),
		EventTitle: event.Title, ImageURL: created.ImageUrl, Caption: created.Caption.String,
		CreatedAt: common.TimestampToString(created.CreatedAt), ExpiresAt: common.TimestampToString(created.ExpiresAt),
	})
}

func (h *Handler) HandleGetEventUpdates(w http.ResponseWriter, r *http.Request) {
	var eventID pgtype.UUID
	if err := eventID.Scan(chi.URLParam(r, "id")); err != nil || !eventID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID eveniment invalid")
		return
	}
	updates, err := h.Queries.ListActiveEventUpdates(r.Context(), eventID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Update-urile nu au putut fi incarcate")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, mapEventUpdates(updates))
}

func (h *Handler) HandleGetOrganizerUpdates(w http.ResponseWriter, r *http.Request) {
	var organizerID pgtype.UUID
	if err := organizerID.Scan(chi.URLParam(r, "id")); err != nil || !organizerID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID organizator invalid")
		return
	}
	updates, err := h.Queries.ListActiveOrganizerUpdates(r.Context(), organizerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Update-urile nu au putut fi incarcate")
		return
	}
	response := make([]OrganizerEventUpdateResponse, 0, len(updates))
	for _, update := range updates {
		response = append(response, mapOrganizerEventUpdate(update))
	}
	router.RespondWithJSON(w, http.StatusOK, response)
}

func (h *Handler) HandleDeleteEventUpdate(w http.ResponseWriter, r *http.Request) {
	userID, _, ok := organizerUpdateIDs(w, r)
	if !ok {
		return
	}
	var updateID pgtype.UUID
	if err := updateID.Scan(chi.URLParam(r, "updateId")); err != nil || !updateID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID update invalid")
		return
	}
	imageURL, err := h.Queries.DeleteOrganizerEventUpdate(r.Context(), db.DeleteOrganizerEventUpdateParams{ID: updateID, OrganizerID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Update-ul nu a fost gasit")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Update-ul nu a putut fi sters")
		return
	}
	if err := deleteManagedOrganizerUpdateImage(r.Context(), imageURL); err != nil {
		// The record is gone. S3 lifecycle will remove a failed leftover later.
		fmt.Printf("event update image cleanup failed: %v\n", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

func mapEventUpdates(updates []db.ListActiveEventUpdatesRow) []OrganizerEventUpdateResponse {
	response := make([]OrganizerEventUpdateResponse, 0, len(updates))
	for _, update := range updates {
		response = append(response, OrganizerEventUpdateResponse{
			ID: update.ID.String(), EventID: update.EventID.String(), OrganizerID: update.OrganizerID.String(),
			EventTitle: update.EventTitle, ImageURL: update.ImageUrl, Caption: update.Caption.String,
			CreatedAt: common.TimestampToString(update.CreatedAt), ExpiresAt: common.TimestampToString(update.ExpiresAt),
		})
	}
	return response
}

func mapOrganizerEventUpdate(update db.ListActiveOrganizerUpdatesRow) OrganizerEventUpdateResponse {
	return OrganizerEventUpdateResponse{
		ID: update.ID.String(), EventID: update.EventID.String(), OrganizerID: update.OrganizerID.String(),
		EventTitle: update.EventTitle, ImageURL: update.ImageUrl, Caption: update.Caption.String,
		CreatedAt: common.TimestampToString(update.CreatedAt), ExpiresAt: common.TimestampToString(update.ExpiresAt),
	}
}

func isOwnedOrganizerUpdateURL(imageURL, userID string) bool {
	key, ok := managedOrganizerUpdateKey(imageURL)
	return ok && strings.HasPrefix(key, organizerUpdatePrefix+userID+"/")
}

func managedOrganizerUpdateKey(imageURL string) (string, bool) {
	publicAPIURL := strings.TrimRight(os.Getenv("PUBLIC_API_URL"), "/")
	baseURL, err := url.Parse(publicAPIURL)
	if err != nil || baseURL.Host == "" {
		return "", false
	}
	parsedURL, err := url.Parse(imageURL)
	if err != nil || parsedURL.Scheme != baseURL.Scheme || parsedURL.Host != baseURL.Host {
		return "", false
	}
	prefix := strings.TrimRight(baseURL.Path, "/") + "/api/v1/media/"
	if !strings.HasPrefix(parsedURL.Path, prefix) {
		return "", false
	}
	key, err := url.PathUnescape(strings.TrimPrefix(parsedURL.Path, prefix))
	if err != nil || !strings.HasPrefix(key, organizerUpdatePrefix) || strings.Contains(key, "..") {
		return "", false
	}
	return key, true
}

func deleteManagedOrganizerUpdateImage(ctx context.Context, imageURL string) error {
	key, ok := managedOrganizerUpdateKey(imageURL)
	if !ok {
		return nil
	}
	bucket := os.Getenv("S3_BUCKET")
	if bucket == "" {
		return fmt.Errorf("S3_BUCKET is not configured")
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return err
	}
	_, err = s3.NewFromConfig(awsCfg).DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	return err
}
