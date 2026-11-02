package outings

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	"pulse-api/internal/router"
	"strings"
	"unicode/utf8"
)

func (h *Handler) meetingPoint(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	event, err := uuid(chi.URLParam(r, "eventID"))
	if err != nil {
		return err
	}
	var req struct {
		Content string `json:"content"`
	}
	if err = body(r, &req); err != nil {
		return err
	}
	content := strings.TrimSpace(req.Content)
	if utf8.RuneCountInString(content) > 160 {
		return invalid("INVALID_REQUEST")
	}
	result, err := h.Pool.Exec(r.Context(), `UPDATE event_safety_groups g SET meeting_point=$3 WHERE g.event_id=$1 AND g.owner_id=$2 AND g.expires_at>CURRENT_TIMESTAMP
    AND EXISTS(SELECT 1 FROM event_safety_group_members m WHERE m.group_id=g.id AND m.user_id=$2 AND m.status='accepted')
    AND EXISTS(SELECT 1 FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=o.event_id WHERE t.user_id=$2 AND o.event_id=$1 AND o.status='completed'
        AND o.stripe_refund_status='none' AND o.stripe_amount_refunded_bani=0 AND NOT o.stripe_refund_needs_attention
        AND NOT EXISTS(SELECT 1 FROM order_refund_operations rf WHERE rf.order_id=o.id)
        AND e.status IN ('published','scheduled') AND e.end_time>CURRENT_TIMESTAMP)`, event, actor, content)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return missing()
	}
	router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
