package notifications

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"pulse-api/internal/common"
	"pulse-api/internal/router"
)

var pushTokenPattern = regexp.MustCompile(`^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{16,200}\]$`)
var pushSecretPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var pushUUIDPattern = regexp.MustCompile(`(?i)^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)

type PushService struct {
	Pool        *pgxpool.Pool
	ProjectID   string
	AccessToken string
	Client      *http.Client
	Endpoint    string // Fixed Expo endpoint in production; injectable for isolated tests.
}

func (p *PushService) configured() bool {
	return p != nil && pushUUIDPattern.MatchString(p.ProjectID) && strings.TrimSpace(p.AccessToken) != ""
}

func (p *PushService) HandleConfig(w http.ResponseWriter, r *http.Request) {
	router.RespondWithJSON(w, http.StatusOK, map[string]any{"enabled": p.configured(), "projectId": p.ProjectID})
}

type pushRegistration struct {
	Token     string `json:"token"`
	Secret    string `json:"secret"`
	ProjectID string `json:"projectId"`
	Platform  string `json:"platform"`
	Language  string `json:"language"`
	UserID    string `json:"userId"` // Only used by capability-based unregister.
}

func (v pushRegistration) valid() bool {
	return pushTokenPattern.MatchString(v.Token) && pushSecretPattern.MatchString(v.Secret) &&
		(v.Platform == "ios" || v.Platform == "android") && (v.Language == "ro" || v.Language == "en")
}
func revokeHash(secret string) string {
	hash := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(hash[:])
}

func registrationKey(secret, owner string) string {
	return revokeHash(secret + ":" + strings.ToLower(owner))
}

func (p *PushService) HandleRegister(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, 401, "Utilizator neautentificat")
		return
	}
	if !p.configured() {
		router.RespondWithError(w, 503, "PUSH_NOT_CONFIGURED")
		return
	}
	var req pushRegistration
	if !router.DecodeJSON(w, r, &req, 2048) {
		return
	}
	if !req.valid() || req.ProjectID != p.ProjectID {
		router.RespondWithError(w, 400, "INVALID_PUSH_DEVICE")
		return
	}
	// Serialise registrations for one user before enforcing a device limit.
	tx, err := p.Pool.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, 503, "PUSH_REGISTRATION_FAILED")
		return
	}
	defer tx.Rollback(context.Background())
	// Both registration and revocation lock the same random capability. A
	// timed-out POST cannot come back to life after unregister returned 204.
	key := registrationKey(req.Secret, common.UUIDToString(userID))
	if _, err = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, key); err != nil {
		router.RespondWithError(w, 503, "PUSH_REGISTRATION_FAILED")
		return
	}
	var revoked bool
	err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM notification_push_revocations WHERE revoke_hash=$1)`, key).Scan(&revoked)
	if err != nil {
		router.RespondWithError(w, 503, "PUSH_REGISTRATION_FAILED")
		return
	}
	if revoked {
		router.RespondWithError(w, 409, "PUSH_REGISTRATION_REVOKED")
		return
	}
	var locked string
	err = tx.QueryRow(r.Context(), `SELECT id::text FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&locked)
	if err == nil {
		// Retain the ten most recently active other phones. A returning phone
		// is re-enabled below; multi-account registrations cannot leak old jobs.
		_, err = tx.Exec(r.Context(), `UPDATE notification_push_devices SET enabled=false WHERE id IN (
            SELECT id FROM notification_push_devices WHERE user_id=$1 AND enabled AND expo_token<>$2
            ORDER BY updated_at DESC OFFSET 9)`, userID, req.Token)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO notification_push_devices(user_id,expo_token,revoke_hash,platform,language)
            VALUES($1,$2,$3,$4,$5) ON CONFLICT(expo_token) DO UPDATE SET
            user_id=excluded.user_id,revoke_hash=excluded.revoke_hash,platform=excluded.platform,
            language=excluded.language,enabled=true,updated_at=clock_timestamp()`, userID, req.Token, revokeHash(req.Secret), req.Platform, req.Language)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		router.RespondWithError(w, 503, "PUSH_REGISTRATION_FAILED")
		return
	}
	router.RespondWithJSON(w, 200, map[string]bool{"success": true})
}

// This endpoint only revokes. The random per-registration capability lets a
// phone complete an offline logout later, even after its JWT has expired.
func (p *PushService) HandleUnregister(w http.ResponseWriter, r *http.Request) {
	var req pushRegistration
	if !router.DecodeJSON(w, r, &req, 2048) {
		return
	}
	if !pushTokenPattern.MatchString(req.Token) || !pushSecretPattern.MatchString(req.Secret) || !pushUUIDPattern.MatchString(req.UserID) {
		router.RespondWithError(w, 400, "INVALID_PUSH_DEVICE")
		return
	}
	tx, err := p.Pool.Begin(r.Context())
	if err != nil {
		router.RespondWithError(w, 503, "PUSH_REGISTRATION_FAILED")
		return
	}
	defer tx.Rollback(context.Background())
	key := registrationKey(req.Secret, req.UserID)
	_, err = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, key)
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO notification_push_revocations(revoke_hash) VALUES($1) ON CONFLICT DO NOTHING`, key)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `UPDATE notification_push_devices SET enabled=false
		WHERE expo_token=$1 AND revoke_hash=$2 AND user_id=$3`, req.Token, revokeHash(req.Secret), req.UserID)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		router.RespondWithError(w, 503, "PUSH_REGISTRATION_FAILED")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Resolve taps against the authenticated account, including notifications older
// than the first page. Never trust an arbitrary URL embedded in a push payload.
func (p *PushService) HandleNotification(w http.ResponseWriter, r *http.Request) {
	userID, ok := userIDFromRequest(r)
	if !ok {
		router.RespondWithError(w, 401, "Utilizator neautentificat")
		return
	}
	id := chi.URLParam(r, "id")
	if !pushUUIDPattern.MatchString(id) {
		router.RespondWithError(w, 400, "ID notificare invalid")
		return
	}
	var item NotificationResponse
	var createdAt time.Time
	err := p.Pool.QueryRow(r.Context(), `SELECT n.id::text,n.type,n.title,n.body,coalesce(n.event_id::text,''),
        coalesce(n.actor_id::text,''),coalesce(u.username,''),coalesce(u.avatar_url,''),n.read_at IS NOT NULL,n.created_at
        FROM notifications n LEFT JOIN users u ON u.id=n.actor_id
        WHERE n.id=$1 AND n.user_id=$2 AND (n.expires_at IS NULL OR n.expires_at>clock_timestamp())
        AND (n.type NOT LIKE 'safety_%' OR EXISTS(SELECT 1 FROM tickets t JOIN orders o ON o.id=t.order_id
            WHERE o.event_id=n.event_id AND o.status='completed' AND (t.user_id=n.user_id OR (t.user_id IS NULL AND o.user_id=n.user_id))))`,
		id, common.UUIDToString(userID)).Scan(&item.ID, &item.Type, &item.Title, &item.Body, &item.EventID, &item.ActorID, &item.ActorUsername, &item.ActorAvatarURL, &item.IsRead, &createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, 404, "Notificarea nu mai este disponibila")
		return
	}
	if err != nil {
		router.RespondWithError(w, 503, "Notificarea nu a putut fi incarcata")
		return
	}
	item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	router.RespondWithJSON(w, 200, item)
}
