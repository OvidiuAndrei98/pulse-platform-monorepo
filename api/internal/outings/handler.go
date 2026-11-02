package outings

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"pulse-api/internal/abuse"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"
)

type Handler struct {
	Pool  *pgxpool.Pool
	Abuse *abuse.Protection
}
type fault struct {
	status int
	code   string
}

func (f fault) Error() string    { return f.code }
func invalid(code string) error  { return fault{http.StatusBadRequest, code} }
func conflict(code string) error { return fault{http.StatusConflict, code} }
func missing() error             { return fault{http.StatusNotFound, "NOT_FOUND"} }
func uuid(s string) (pgtype.UUID, error) {
	var id pgtype.UUID
	if id.Scan(s) != nil || !id.Valid || id.Bytes == [16]byte{} {
		return id, invalid("INVALID_ID")
	}
	return id, nil
}
func sid(id pgtype.UUID) string { return common.UUIDToString(id) }
func body(r *http.Request, target any) error {
	data, err := io.ReadAll(io.LimitReader(r.Body, 8193))
	if err != nil || len(data) > 8192 {
		return invalid("INVALID_REQUEST")
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.DisallowUnknownFields()
	if d.Decode(target) != nil {
		return invalid("INVALID_REQUEST")
	}
	var trailing any
	if d.Decode(&trailing) != io.EOF {
		return invalid("INVALID_REQUEST")
	}
	return nil
}

type operation func(http.ResponseWriter, *http.Request, pgtype.UUID) error

func (h *Handler) endpoint(scope string, write bool, f operation) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		raw, err := auth.GetUserIDFromContext(r.Context())
		actor, e := uuid(raw)
		if err != nil || e != nil {
			router.RespondWithError(w, 401, "UNAUTHORIZED")
			return
		}
		var active bool
		err = h.Pool.QueryRow(r.Context(), `SELECT is_active FROM users WHERE id=$1`, actor).Scan(&active)
		if errors.Is(err, pgx.ErrNoRows) || err == nil && !active {
			router.RespondWithError(w, 401, "UNAUTHORIZED")
			return
		}
		if err == nil && write && h.Abuse != nil && !h.Abuse.Enforce(r.Context(), w, "outings_"+scope, sid(actor), 30, time.Hour) {
			return
		}
		if err == nil {
			err = f(w, r, actor)
		}
		if err == nil {
			return
		}
		var known fault
		if errors.As(err, &known) {
			router.RespondWithError(w, known.status, known.code)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			router.RespondWithError(w, 404, "NOT_FOUND")
			return
		}
		// Deliberately exclude SQL parameters, recipient addresses and QR values.
		log.Printf("outings operation failed: scope=%s type=%T", scope, err)
		router.RespondWithError(w, 503, "TEMPORARILY_UNAVAILABLE")
	}
}
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Post("/meeting-point/{eventID}", h.endpoint("meeting_point", true, h.meetingPoint))
	r.Get("/plans", h.endpoint("plans", false, h.listPlans))
	r.Post("/plans", h.endpoint("create_plan", true, h.createPlan))
	r.Get("/plans/{planID}", h.endpoint("plan", false, h.getPlan))
	r.Post("/plans/{planID}/respond", h.endpoint("respond_plan", true, h.respondPlan))
	r.Post("/plans/{planID}/vote", h.endpoint("vote", true, h.vote))
	r.Post("/plans/{planID}/choose", h.endpoint("choose", true, h.choose))
	r.Get("/transfers", h.endpoint("transfers", false, h.listTransfers))
	r.Post("/transfers", h.endpoint("create_transfer", true, h.createTransfer))
	r.Post("/transfers/{transferID}/respond", h.endpoint("respond_transfer", true, h.respondTransfer))
	return r
}
func uniqueIDs(values []string, min, max int) ([]pgtype.UUID, error) {
	if len(values) < min || len(values) > max {
		return nil, invalid("INVALID_SELECTION")
	}
	ids := make([]pgtype.UUID, 0, len(values))
	seen := map[[16]byte]bool{}
	for _, v := range values {
		id, err := uuid(v)
		if err != nil || seen[id.Bytes] {
			return nil, invalid("INVALID_SELECTION")
		}
		seen[id.Bytes] = true
		ids = append(ids, id)
	}
	return ids, nil
}
func (h *Handler) StartCleanupWorker(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := expireTransfers(ctx, h.Pool, pgtype.UUID{}); err != nil {
					log.Print("ticket transfer expiry failed")
				}
				if err := deliverTransferNotifications(ctx, h.Pool); err != nil {
					log.Print("ticket transfer notification delivery failed")
				}
				if _, err := h.Pool.Exec(ctx, `DELETE FROM outing_plans WHERE expires_at<=CURRENT_TIMESTAMP`); err != nil {
					log.Print("outing plan retention failed")
				}
				if _, err := h.Pool.Exec(ctx, `DELETE FROM ticket_transfers WHERE status<>'pending' AND COALESCE(responded_at,created_at)<CURRENT_TIMESTAMP-interval '90 days'`); err != nil {
					log.Print("ticket transfer retention failed")
				}
			}
		}
	}()
}
