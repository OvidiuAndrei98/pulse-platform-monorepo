package users

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"pulse-api/internal/auth"
	"pulse-api/internal/router"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const maxDeleteAccountRequestBytes = 1024

type deleteAccountRequest struct {
	Confirmation    string `json:"confirmation"`
	CurrentPassword string `json:"currentPassword"`
}

// HandleDeleteMe permanently removes a participant account. Order, payment,
// refund and fiscal records are intentionally retained for legal and accounting
// obligations, but their user_id is detached by the database foreign keys.
func (h *Handler) HandleDeleteMe(w http.ResponseWriter, r *http.Request) {
	if h.DB == nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Stergerea contului nu este disponibila momentan")
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

	var request deleteAccountRequest
	if !router.DecodeJSON(w, r, &request, maxDeleteAccountRequestBytes) {
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Contul nu a putut fi sters")
		return
	}
	defer tx.Rollback(r.Context())

	var email string
	var role pgtype.Text
	var avatarURL, passwordHash pgtype.Text
	err = tx.QueryRow(r.Context(), `
		SELECT email, role, avatar_url, password_hash
		FROM users
		WHERE id = $1
		FOR UPDATE`, userUUID).Scan(&email, &role, &avatarURL, &passwordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusNotFound, "Utilizatorul nu a fost gasit")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Contul nu a putut fi sters")
		return
	}
	if !role.Valid || role.String != "user" {
		router.RespondWithError(w, http.StatusConflict, "Conturile de organizator sau administrator se inchid prin suport")
		return
	}
	if !sameAccountConfirmation(request.Confirmation, email) {
		router.RespondWithError(w, http.StatusBadRequest, "Adresa de email pentru confirmare nu corespunde contului")
		return
	}
	if len(request.CurrentPassword) > 256 {
		router.RespondWithError(w, http.StatusBadRequest, "Parola pentru confirmare este invalida")
		return
	}
	if passwordHash.Valid && passwordHash.String != "" {
		if request.CurrentPassword == "" || !auth.CheckPasswordHash(request.CurrentPassword, passwordHash.String) {
			router.RespondWithError(w, http.StatusUnauthorized, "Parola curenta este incorecta")
			return
		}
	} else {
		issuedAt, issuedAtErr := auth.GetIssuedAtFromContext(r.Context())
		age := time.Since(issuedAt)
		if issuedAtErr != nil || age < -time.Minute || age > 10*time.Minute {
			router.RespondWithError(w, http.StatusUnauthorized, "Reconecteaza-te cu Google inainte de stergerea contului")
			return
		}
	}

	avatarKey := ""
	if avatarURL.Valid {
		avatarKey = ownedAvatarKey(avatarURL.String, userID)
	}
	if avatarKey != "" {
		if _, err = tx.Exec(r.Context(), `
			INSERT INTO user_media_deletion_jobs (object_key)
			VALUES ($1)
			ON CONFLICT (object_key) DO NOTHING`, avatarKey); err != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Stergerea pozei de profil nu a putut fi programata")
			return
		}
	}

	// Tickets contain the live admission credential. Deleting them removes the
	// online credential immediately; previously downloaded offline validation
	// snapshots expire or refresh separately. Orders remain available for the
	// platform's mandatory fiscal retention period.
	if _, err = tx.Exec(r.Context(), `
		UPDATE orders
		SET account_owner_deleted_at = CURRENT_TIMESTAMP
		WHERE user_id = $1`, userUUID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Comenzile contului nu au putut fi detasate")
		return
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM tickets WHERE user_id = $1`, userUUID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Biletele contului nu au putut fi sterse")
		return
	}
	deleted, err := tx.Exec(r.Context(), `DELETE FROM users WHERE id = $1 AND role = 'user'`, userUUID)
	if err != nil {
		router.RespondWithError(w, http.StatusConflict, "Contul nu poate fi sters automat. Contacteaza suportul SPOTTR")
		return
	}
	if deleted.RowsAffected() != 1 {
		router.RespondWithError(w, http.StatusConflict, "Contul nu poate fi sters automat. Contacteaza suportul SPOTTR")
		return
	}

	if err = tx.Commit(r.Context()); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Contul nu a putut fi sters")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func sameAccountConfirmation(confirmation, email string) bool {
	return strings.EqualFold(strings.TrimSpace(confirmation), strings.TrimSpace(email))
}

func deleteAvatarObject(ctx context.Context, key string) error {
	bucket := strings.TrimSpace(os.Getenv("S3_BUCKET"))
	if bucket == "" {
		return errors.New("S3_BUCKET is not configured")
	}
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return err
	}
	_, err = s3.NewFromConfig(awsCfg).DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

func (h *Handler) processMediaDeletionJob(ctx context.Context, key string) {
	deleteCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	err := deleteAvatarObject(deleteCtx, key)
	cancel()
	if err != nil {
		log.Printf("user media deletion deferred: key=%q err=%v", key, err)
		_, updateErr := h.DB.Exec(ctx, `
			UPDATE user_media_deletion_jobs
			SET attempts = attempts + 1,
				last_error = LEFT($2, 1000),
				next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
			WHERE object_key = $1`, key, err.Error())
		if updateErr != nil {
			log.Printf("user media deletion retry could not be recorded: key=%q err=%v", key, updateErr)
		}
		return
	}
	if _, err := h.DB.Exec(ctx, `DELETE FROM user_media_deletion_jobs WHERE object_key = $1`, key); err != nil {
		log.Printf("completed user media deletion job could not be cleared: key=%q err=%v", key, err)
	}
}

// StartMediaDeletionWorker retries durable S3 cleanup jobs created atomically
// with account deletion. S3 deletes are idempotent, so overlapping workers are safe.
func (h *Handler) StartMediaDeletionWorker(ctx context.Context) {
	run := func() {
		rows, err := h.DB.Query(ctx, `
			SELECT object_key
			FROM user_media_deletion_jobs
			WHERE next_attempt_at <= CURRENT_TIMESTAMP
			ORDER BY next_attempt_at
			LIMIT 50`)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				log.Printf("user media deletion jobs could not be loaded: %v", err)
			}
			return
		}
		var keys []string
		for rows.Next() {
			var key string
			if err := rows.Scan(&key); err == nil {
				keys = append(keys, key)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			if !errors.Is(err, context.Canceled) {
				log.Printf("user media deletion jobs could not be read: %v", err)
			}
			return
		}
		rows.Close()
		for _, key := range keys {
			h.processMediaDeletionJob(ctx, key)
		}
	}

	go func() {
		run()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				run()
			}
		}
	}()
}
