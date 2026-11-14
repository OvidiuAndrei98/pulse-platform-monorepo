package outings

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	"pulse-api/internal/router"
)

func (h *Handler) groupOutings(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "groupID"))
	if err != nil {
		return err
	}
	var before pgtype.UUID
	if raw := r.URL.Query().Get("before"); raw != "" {
		before, err = uuid(raw)
		if err != nil {
			return invalid("INVALID_CURSOR")
		}
	}
	tx, err := h.Pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	g, err := groupAccess(r.Context(), tx, id, actor, false)
	if err != nil {
		return err
	}
	if g.Status != "accepted" {
		return missing()
	}
	rows, err := tx.Query(r.Context(), `SELECT p.id FROM outing_plans p JOIN outing_plan_members m ON m.plan_id=p.id AND m.user_id=$2 AND m.status='accepted' WHERE p.group_id=$1
 AND ($3::uuid IS NULL OR (p.created_at,p.id)<(SELECT created_at,id FROM outing_plans WHERE id=$3 AND group_id=$1)) ORDER BY p.created_at DESC,p.id DESC LIMIT 21`, id, actor, before)
	if err != nil {
		return err
	}
	ids := []pgtype.UUID{}
	for rows.Next() {
		var pid pgtype.UUID
		if err = rows.Scan(&pid); err != nil {
			break
		}
		ids = append(ids, pid)
	}
	rows.Close()
	if err != nil {
		return err
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	more := len(ids) > 20
	if more {
		ids = ids[:20]
	}
	items := []plan{}
	for _, pid := range ids {
		p, e := readPlan(r.Context(), tx, pid, actor)
		if e != nil {
			return e
		}
		items = append(items, p)
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, map[string]any{"items": items, "hasMore": more})
	return nil
}
