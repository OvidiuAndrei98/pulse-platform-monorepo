package outings

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	"pulse-api/internal/router"
)

func (h *Handler) ticketStatus(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	var req struct {
		ShareStatus bool `json:"shareStatus"`
		NeedsTicket bool `json:"needsTicket"`
	}
	if err := body(r, &req); err != nil {
		return err
	}
	id, err := uuid(chi.URLParam(r, "planID"))
	if err != nil {
		return err
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	p, err := lockPlanning(r.Context(), tx, id, actor)
	if err != nil {
		return err
	}
	if !p.chosen.Valid {
		return conflict("PLAN_CHANGED")
	}
	_, err = tx.Exec(r.Context(), `UPDATE outing_plan_members SET ticket_status_shared=$3,needs_ticket=$4 WHERE plan_id=$1 AND user_id=$2`, id, actor, req.ShareStatus, req.NeedsTicket)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), `UPDATE outing_plans SET revision=revision+1 WHERE id=$1`, id); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
