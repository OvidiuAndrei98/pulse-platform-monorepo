package outings

import (
	"context"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	"pulse-api/internal/router"
	"strconv"
	"time"
)

// Bounded long polling uses one small indexed lookup per second, without holding
// a database connection between ticks. Every lookup rechecks membership.
func (h *Handler) planChanges(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "planID"))
	if err != nil {
		return err
	}
	previous, err := strconv.ParseInt(r.URL.Query().Get("revision"), 10, 64)
	if err != nil || previous < 0 {
		return invalid("INVALID_REVISION")
	}
	deadline := time.NewTimer(8 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		var current int64
		if err = h.Pool.QueryRow(r.Context(), `SELECT p.revision FROM outing_plans p JOIN outing_plan_members m ON m.plan_id=p.id JOIN users u ON u.id=m.user_id AND u.is_active WHERE p.id=$1 AND m.user_id=$2 AND m.status<>'declined' AND p.expires_at>CURRENT_TIMESTAMP`, id, actor).Scan(&current); err != nil {
			return err
		}
		if current != previous {
			router.RespondWithJSON(w, 200, map[string]any{"revision": current, "changed": true})
			return nil
		}
		select {
		case <-r.Context().Done():
			return nil
		case <-deadline.C:
			router.RespondWithJSON(w, 200, map[string]any{"revision": current, "changed": false})
			return nil
		case <-tick.C:
		}
	}
}

func (h *Handler) notifyPlanDeadlines(ctx context.Context) error {
	// Claim and notify in the same transaction; retries and multiple API replicas
	// cannot create duplicate reminders. A late decision stays the owner's choice.
	tx, err := h.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `WITH due AS (
  UPDATE outing_plans SET deadline_reminded_at=CURRENT_TIMESTAMP
  WHERE chosen_event_id IS NULL AND expires_at>CURRENT_TIMESTAMP AND deadline_reminded_at IS NULL
    AND decision_at>CURRENT_TIMESTAMP AND decision_at<=CURRENT_TIMESTAMP+interval '30 minutes'
  RETURNING id,owner_id,expires_at)
 INSERT INTO notifications(user_id,type,title,body,actor_id,expires_at)
 SELECT m.user_id,'outing_plan_reminder','Your group is deciding soon','Open the outing to share your availability or event choices.',d.owner_id,d.expires_at
 FROM due d JOIN outing_plan_members m ON m.plan_id=d.id JOIN users u ON u.id=m.user_id AND u.is_active WHERE m.status='accepted'`)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `WITH due AS (
  UPDATE outing_plans SET deadline_closed_notified_at=CURRENT_TIMESTAMP
  WHERE chosen_event_id IS NULL AND expires_at>CURRENT_TIMESTAMP AND deadline_closed_notified_at IS NULL AND decision_at<=CURRENT_TIMESTAMP
  RETURNING owner_id,expires_at)
 INSERT INTO notifications(user_id,type,title,body,actor_id,expires_at)
 SELECT owner_id,'outing_plan_deadline','Time to decide','Review your group responses and confirm the outing, or extend the deadline.',owner_id,expires_at FROM due`)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
