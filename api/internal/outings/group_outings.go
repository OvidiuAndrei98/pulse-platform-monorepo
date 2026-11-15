package outings

import (
	"context"
	"errors"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	"pulse-api/internal/router"
	"strings"
	"time"
)

func (h *Handler) createGroupOuting(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	group, err := uuid(chi.URLParam(r, "groupID"))
	if err != nil {
		return err
	}
	var req struct {
		RequestID string   `json:"requestId"`
		Title     string   `json:"title,omitempty"`
		City      string   `json:"city,omitempty"`
		Date      string   `json:"date,omitempty"`
		Dates     []string `json:"dates,omitempty"`
		EventID   string   `json:"eventId,omitempty"`
	}
	if err = body(r, &req); err != nil {
		return err
	}
	key, err := uuid(req.RequestID)
	if err != nil {
		return err
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	g, err := groupAccess(r.Context(), tx, group, actor, true)
	if err != nil {
		return err
	}
	if g.Status != "accepted" {
		return missing()
	}
	fingerprint := groupFingerprint([]any{sid(group), req})
	var id pgtype.UUID
	var original *string
	err = tx.QueryRow(r.Context(), `SELECT id,request_fingerprint FROM outing_plans WHERE group_id=$1 AND request_id=$2`, group, key).Scan(&id, &original)
	if err == nil {
		if original == nil || *original != fingerprint {
			return conflict("REQUEST_REUSED")
		}
		p, e := readPlan(r.Context(), tx, id, actor)
		if e != nil {
			return e
		}
		router.RespondWithJSON(w, 200, p)
		return nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	event := pgtype.UUID{}
	knownOngoing := false
	if req.EventID != "" {
		if len(req.Dates) > 0 {
			return invalid("INVALID_PLAN_CONTEXT")
		}
		event, err = uuid(req.EventID)
		if err != nil {
			return err
		}
		if err = tx.QueryRow(r.Context(), `SELECT ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date::text,city,start_time<=CURRENT_TIMESTAMP FROM events WHERE id=$1 AND status='published' AND end_time>CURRENT_TIMESTAMP`, event).Scan(&req.Date, &req.City, &knownOngoing); err != nil {
			return invalid("EVENT_UNAVAILABLE")
		}
	}
	req.City = canonicalCity(req.City)
	if req.City == "" {
		return invalid("INVALID_PLAN_CONTEXT")
	}
	dates := req.Dates
	if req.Date != "" {
		dates = []string{req.Date}
	}
	if len(dates) < 1 || len(dates) > 3 {
		return invalid("INVALID_PLAN_CONTEXT")
	}
	seen := map[string]bool{}
	last := ""
	for _, day := range dates {
		// An explicit still-running occurrence retains its actual original night.
		// Manual night searches remain future/current-night only and never gain
		// unrelated multi-day events just because their intervals overlap.
		if !validPlanningDate(day, time.Now()) && !knownOngoing || seen[day] {
			return invalid("INVALID_PLAN_CONTEXT")
		}
		seen[day] = true
		if day > last {
			last = day
		}
	}
	// A single choice is already a fixed night, never an artificial date poll.
	var day any
	if len(dates) == 1 {
		day = dates[0]
		var existingCity string
		err = tx.QueryRow(r.Context(), `SELECT id,city FROM outing_plans WHERE group_id=$1 AND outing_date=$2::date`, group, day).Scan(&id, &existingCity)
		if err == nil {
			if existingCity != req.City {
				return conflict("OUTING_EXISTS")
			}
			p, e := readPlan(r.Context(), tx, id, actor)
			if e != nil {
				return e
			}
			router.RespondWithJSON(w, 200, p)
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = dates[0]
	}
	if len([]rune(title)) > 80 {
		return invalid("INVALID_TITLE")
	}
	err = tx.QueryRow(r.Context(), `INSERT INTO outing_plans(group_id,owner_id,request_id,request_fingerprint,title,city,outing_date,chosen_event_id,expires_at,destination_start_time,destination_location)
 VALUES($1,$2,$3,$4,$5,$6,$7::date,$8,COALESCE((SELECT end_time FROM events WHERE id=$8),(($9::date+1)::timestamp+interval '6 hours') AT TIME ZONE 'Europe/Bucharest'),(SELECT start_time FROM events WHERE id=$8),(SELECT location_name FROM events WHERE id=$8)) RETURNING id`, group, actor, key, fingerprint, title, req.City, day, event, last).Scan(&id)
	if err != nil {
		return err
	}
	_, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_members(plan_id,user_id,status,ticket_status_shared) SELECT $1,user_id,'accepted',TRUE FROM friend_group_members WHERE group_id=$2 AND status='accepted'`, id, group)
	if err != nil {
		return err
	}
	for _, date := range dates {
		if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_dates(plan_id,outing_date) VALUES($1,$2::date)`, id, date); err != nil {
			return err
		}
	}
	if event.Valid {
		if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_options(plan_id,event_id,position,proposed_by) VALUES($1,$2,0,$3)`, id, event, actor); err != nil {
			return err
		}
		if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_decisions(plan_id,round,event_id) VALUES($1,1,$2)`, id, event); err != nil {
			return err
		}
	}
	if err = appendGroupMessage(r.Context(), tx, group, actor, key, "outing", "", event, id); err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO notifications(user_id,type,title,body,actor_id,friend_group_id,outing_plan_id)
 SELECT user_id,'friend_group_outing','A new night','A friend proposed an outing in your group.',$2,$1,$3 FROM friend_group_members WHERE group_id=$1 AND status='accepted' AND user_id<>$2 AND NOT muted`, group, actor, id); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	p, err := readPlan(r.Context(), h.Pool, id, actor)
	if err != nil {
		return err
	}
	router.RespondWithJSON(w, 201, p)
	return nil
}
func (h *Handler) attendance(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "planID"))
	if err != nil {
		return err
	}
	var req struct {
		Answer        string `json:"answer"`
		DecisionRound int    `json:"decisionRound"`
	}
	if err = body(r, &req); err != nil {
		return err
	}
	if !validPlanAnswer(req.Answer) {
		return invalid("INVALID_REACTION")
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
	var round int
	if err = tx.QueryRow(r.Context(), `SELECT decision_round FROM outing_plans WHERE id=$1`, id).Scan(&round); err != nil {
		return err
	}
	if round != req.DecisionRound {
		return conflict("PLAN_CHANGED")
	}
	// A cancelled event may still have a future end time. Its conversation stays
	// available, but it must not keep accepting attendance responses.
	var available bool
	if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM events WHERE id=$1 AND status='published' AND end_time>CURRENT_TIMESTAMP)`, p.chosen).Scan(&available); err != nil {
		return err
	}
	if !available {
		return conflict("EVENT_UNAVAILABLE")
	}
	_, err = tx.Exec(r.Context(), `INSERT INTO outing_attendance(plan_id,user_id,decision_round,answer) VALUES($1,$2,$3,$4) ON CONFLICT(plan_id,user_id,decision_round) DO UPDATE SET answer=$4,responded_at=clock_timestamp()`, id, actor, round, req.Answer)
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

func notifyGroupDecision(ctx context.Context, q queryer, id, actor, event pgtype.UUID, kind string) error {
	var group, key pgtype.UUID
	if err := q.QueryRow(ctx, `SELECT group_id,gen_random_uuid() FROM outing_plans WHERE id=$1`, id).Scan(&group, &key); err != nil {
		return err
	}
	if !group.Valid {
		return nil
	}
	if err := appendGroupMessage(ctx, q, group, actor, key, "outing", "", event, id); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `INSERT INTO notifications(user_id,type,title,body,actor_id,event_id,friend_group_id,outing_plan_id)
 SELECT m.user_id,$4,'Your outing changed','Open your group to see the destination.',$2,$3,$5,$1 FROM friend_group_members m JOIN users u ON u.id=m.user_id AND u.is_active WHERE m.group_id=$5 AND m.status='accepted' AND NOT m.muted AND m.user_id<>$2`, id, actor, event, kind, group)
	return err
}
func groupPlanAccess(ctx context.Context, q queryer, id, actor pgtype.UUID) error {
	var group pgtype.UUID
	if err := q.QueryRow(ctx, `SELECT group_id FROM outing_plans WHERE id=$1`, id).Scan(&group); err != nil {
		return err
	}
	if !group.Valid {
		return nil
	}
	g, err := groupAccess(ctx, q, group, actor, false)
	if err != nil {
		return err
	}
	if g.Status != "accepted" {
		return missing()
	}
	var included bool
	err = q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM outing_plan_members WHERE plan_id=$1 AND user_id=$2 AND status='accepted')`, id, actor).Scan(&included)
	if err == nil && !included {
		return missing()
	}
	return err
}

// All writes take the same group -> plan lock order as invitations/leave and
// checkout. Membership cannot be revoked between authorization and commit.
func lockGroupForPlan(ctx context.Context, tx pgx.Tx, id, actor pgtype.UUID) error {
	var group pgtype.UUID
	if err := tx.QueryRow(ctx, `SELECT group_id FROM outing_plans WHERE id=$1`, id).Scan(&group); err != nil {
		return err
	}
	if group.Valid {
		g, err := groupAccess(ctx, tx, group, actor, true)
		if err != nil {
			return err
		}
		if g.Status != "accepted" {
			return missing()
		}
	}
	return groupPlanAccess(ctx, tx, id, actor)
}
