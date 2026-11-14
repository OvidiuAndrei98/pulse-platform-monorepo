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
  WHERE group_id IS NOT NULL AND chosen_event_id IS NULL AND expires_at>CURRENT_TIMESTAMP AND deadline_reminded_at IS NULL
    AND decision_at>CURRENT_TIMESTAMP AND decision_at<=CURRENT_TIMESTAMP+interval '30 minutes'
  RETURNING id,group_id,owner_id,expires_at)
 INSERT INTO notifications(user_id,type,title,body,actor_id,expires_at,friend_group_id,outing_plan_id)
 SELECT m.user_id,'friend_group_outing','Your group is deciding soon','Open the outing to share your availability or event choices.',d.owner_id,d.expires_at,d.group_id,d.id
 FROM due d JOIN friend_group_members m ON m.group_id=d.group_id JOIN users u ON u.id=m.user_id AND u.is_active WHERE m.status='accepted' AND NOT m.muted`)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `WITH due AS (
  UPDATE outing_plans SET deadline_closed_notified_at=CURRENT_TIMESTAMP
  WHERE group_id IS NOT NULL AND chosen_event_id IS NULL AND expires_at>CURRENT_TIMESTAMP AND deadline_closed_notified_at IS NULL AND decision_at<=CURRENT_TIMESTAMP
  RETURNING id,group_id,owner_id,expires_at)
 INSERT INTO notifications(user_id,type,title,body,actor_id,expires_at,friend_group_id,outing_plan_id)
 SELECT d.owner_id,'friend_group_outing','Time to decide','Review your group responses and confirm the outing, or extend the deadline.',d.owner_id,d.expires_at,d.group_id,d.id FROM due d JOIN friend_group_members m ON m.group_id=d.group_id AND m.user_id=d.owner_id AND m.status='accepted' AND NOT m.muted`)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
