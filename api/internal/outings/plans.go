package outings

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"pulse-api/internal/router"
)

type queryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}
type planMember struct {
	UserID      string `json:"userId"`
	Username    string `json:"username"`
	Status      string `json:"status"`
	VoteEventID string `json:"voteEventId,omitempty"`
}
type planOption struct {
	EventID   string    `json:"eventId"`
	Title     string    `json:"title"`
	Location  string    `json:"location"`
	StartTime time.Time `json:"startTime"`
	Available bool      `json:"available"`
}
type plan struct {
	ID            string       `json:"id"`
	OwnerID       string       `json:"ownerId"`
	Title         string       `json:"title"`
	Status        string       `json:"status"`
	ChosenEventID string       `json:"chosenEventId,omitempty"`
	ExpiresAt     time.Time    `json:"expiresAt"`
	Members       []planMember `json:"members"`
	Options       []planOption `json:"options"`
}
type createPlanRequest struct {
	RequestID string   `json:"requestId"`
	Title     string   `json:"title"`
	EventIDs  []string `json:"eventIds"`
	FriendIDs []string `json:"friendIds"`
}

func readPlan(ctx context.Context, q queryer, id, actor pgtype.UUID) (plan, error) {
	var p plan
	var chosen pgtype.UUID
	err := q.QueryRow(ctx, `SELECT p.id::text,p.owner_id::text,p.title,m.status,p.chosen_event_id,p.expires_at
        FROM outing_plans p JOIN outing_plan_members m ON m.plan_id=p.id
        WHERE p.id=$1 AND m.user_id=$2 AND m.status<>'declined' AND p.expires_at>CURRENT_TIMESTAMP`, id, actor).
		Scan(&p.ID, &p.OwnerID, &p.Title, &p.Status, &chosen, &p.ExpiresAt)
	if err != nil {
		return p, err
	}
	if chosen.Valid {
		p.ChosenEventID = sid(chosen)
	}
	p.Members = make([]planMember, 0)
	p.Options = make([]planOption, 0)
	rows, err := q.Query(ctx, `SELECT m.user_id::text,u.username,m.status,CASE WHEN $2 THEN COALESCE(v.event_id::text,'') ELSE '' END
        FROM outing_plan_members m JOIN users u ON u.id=m.user_id LEFT JOIN outing_plan_votes v ON v.plan_id=m.plan_id AND v.user_id=m.user_id
        WHERE m.plan_id=$1 AND m.status<>'declined' ORDER BY u.username,m.user_id`, id, p.Status == "accepted")
	if err != nil {
		return p, err
	}
	for rows.Next() {
		var m planMember
		if err = rows.Scan(&m.UserID, &m.Username, &m.Status, &m.VoteEventID); err != nil {
			break
		}
		p.Members = append(p.Members, m)
	}
	rows.Close()
	if err != nil {
		return p, err
	}
	if rows.Err() != nil {
		return p, rows.Err()
	}
	rows, err = q.Query(ctx, `SELECT e.id::text,e.title,e.location_name,e.start_time,e.status IN ('published','scheduled') AND e.end_time>CURRENT_TIMESTAMP
        FROM outing_plan_options o JOIN events e ON e.id=o.event_id WHERE o.plan_id=$1 ORDER BY o.position`, id)
	if err != nil {
		return p, err
	}
	defer rows.Close()
	for rows.Next() {
		var o planOption
		if err = rows.Scan(&o.EventID, &o.Title, &o.Location, &o.StartTime, &o.Available); err != nil {
			return p, err
		}
		p.Options = append(p.Options, o)
	}
	return p, rows.Err()
}
func (h *Handler) listPlans(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	rows, err := h.Pool.Query(r.Context(), `SELECT p.id FROM outing_plan_members m JOIN outing_plans p ON p.id=m.plan_id
        WHERE m.user_id=$1 AND m.status<>'declined' AND p.expires_at>CURRENT_TIMESTAMP ORDER BY p.created_at DESC LIMIT 50`, actor)
	if err != nil {
		return err
	}
	ids := []pgtype.UUID{}
	for rows.Next() {
		var id pgtype.UUID
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err != nil {
		return err
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	result := make([]plan, 0, len(ids))
	for _, id := range ids {
		p, e := readPlan(r.Context(), h.Pool, id, actor)
		if errors.Is(e, pgx.ErrNoRows) {
			continue
		}
		if e != nil {
			return e
		}
		result = append(result, p)
	}
	router.RespondWithJSON(w, 200, result)
	return nil
}
func (h *Handler) getPlan(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "planID"))
	if err != nil {
		return err
	}
	p, err := readPlan(r.Context(), h.Pool, id, actor)
	if err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, p)
	return nil
}
func (h *Handler) createPlan(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	var req createPlanRequest
	if err := body(r, &req); err != nil {
		return err
	}
	request, err := uuid(req.RequestID)
	if err != nil {
		return err
	}
	title := strings.TrimSpace(req.Title)
	if utf8.RuneCountInString(title) < 1 || utf8.RuneCountInString(title) > 80 {
		return invalid("INVALID_TITLE")
	}
	events, err := uniqueIDs(req.EventIDs, 2, 4)
	if err != nil {
		return err
	}
	friends, err := uniqueIDs(req.FriendIDs, 1, 7)
	if err != nil {
		return err
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	// One account-level lock also serializes create retries before the unique key.
	if _, err = tx.Exec(r.Context(), `SELECT id FROM users WHERE id=$1 AND is_active FOR UPDATE`, actor); err != nil {
		return err
	}
	var id pgtype.UUID
	err = tx.QueryRow(r.Context(), `SELECT id FROM outing_plans WHERE owner_id=$1 AND request_id=$2`, actor, request).Scan(&id)
	if err == nil {
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
	for _, event := range events {
		var ok bool
		err = tx.QueryRow(r.Context(), `SELECT status IN ('published','scheduled') AND end_time>CURRENT_TIMESTAMP FROM events WHERE id=$1`, event).Scan(&ok)
		if errors.Is(err, pgx.ErrNoRows) || err == nil && !ok {
			return invalid("EVENT_UNAVAILABLE")
		}
		if err != nil {
			return err
		}
	}
	for _, friend := range friends {
		var ok bool
		err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM friendships f JOIN users u ON u.id=$2 AND u.is_active
        WHERE f.status='accepted' AND ((f.user_id=$1 AND f.friend_id=$2) OR (f.user_id=$2 AND f.friend_id=$1)))`, actor, friend).Scan(&ok)
		if err != nil {
			return err
		}
		if !ok {
			return invalid("FRIEND_UNAVAILABLE")
		}
	}
	err = tx.QueryRow(r.Context(), `INSERT INTO outing_plans(owner_id,request_id,title) VALUES($1,$2,$3) RETURNING id`, actor, request, title).Scan(&id)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_members(plan_id,user_id,status) VALUES($1,$2,'accepted')`, id, actor); err != nil {
		return err
	}
	for i, event := range events {
		if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_options(plan_id,event_id,position) VALUES($1,$2,$3)`, id, event, i); err != nil {
			return err
		}
	}
	for _, friend := range friends {
		if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_members(plan_id,user_id,status) VALUES($1,$2,'pending')`, id, friend); err != nil {
			return err
		}
		if _, err = tx.Exec(r.Context(), `INSERT INTO notifications(user_id,type,title,body,actor_id,expires_at) SELECT $1,'outing_plan_invite','Where are we going?','You have a private outing invitation.',$2,expires_at FROM outing_plans WHERE id=$3`, friend, actor, id); err != nil {
			return err
		}
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
func (h *Handler) respondPlan(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	return h.changePlan(w, r, actor, "respond")
}
func (h *Handler) vote(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	return h.changePlan(w, r, actor, "vote")
}
func (h *Handler) choose(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	return h.changePlan(w, r, actor, "choose")
}
func (h *Handler) changePlan(w http.ResponseWriter, r *http.Request, actor pgtype.UUID, action string) error {
	id, err := uuid(chi.URLParam(r, "planID"))
	if err != nil {
		return err
	}
	var req struct {
		Status  string `json:"status,omitempty"`
		EventID string `json:"eventId,omitempty"`
	}
	if err = body(r, &req); err != nil {
		return err
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var owner, chosen pgtype.UUID
	var status string
	err = tx.QueryRow(r.Context(), `SELECT p.owner_id,p.chosen_event_id,m.status FROM outing_plans p JOIN outing_plan_members m ON m.plan_id=p.id
        WHERE p.id=$1 AND m.user_id=$2 AND p.expires_at>CURRENT_TIMESTAMP FOR UPDATE OF p,m`, id, actor).Scan(&owner, &chosen, &status)
	if err != nil {
		return err
	}
	if action == "respond" {
		if req.Status != "accepted" && req.Status != "declined" {
			return invalid("INVALID_STATUS")
		}
		if owner == actor || status != "pending" && status != req.Status {
			return conflict("INVITATION_CLOSED")
		}
		_, err = tx.Exec(r.Context(), `UPDATE outing_plan_members SET status=$3 WHERE plan_id=$1 AND user_id=$2`, id, actor, req.Status)
	} else {
		if status != "accepted" {
			return missing()
		}
		event, e := uuid(req.EventID)
		if e != nil {
			return e
		}
		if chosen.Valid {
			if action == "choose" && chosen == event {
				router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
				return nil
			}
			return conflict("PLAN_DECIDED")
		}
		var available bool
		err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM outing_plan_options o JOIN events e ON e.id=o.event_id
            WHERE o.plan_id=$1 AND o.event_id=$2 AND e.status IN ('published','scheduled') AND e.end_time>CURRENT_TIMESTAMP)`, id, event).Scan(&available)
		if err != nil {
			return err
		}
		if !available {
			return conflict("EVENT_UNAVAILABLE")
		}
		if action == "choose" {
			if owner != actor {
				return missing()
			}
			_, err = tx.Exec(r.Context(), `UPDATE outing_plans SET chosen_event_id=$2 WHERE id=$1`, id, event)
		} else {
			_, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_votes(plan_id,user_id,event_id) VALUES($1,$2,$3) ON CONFLICT(plan_id,user_id) DO UPDATE SET event_id=EXCLUDED.event_id`, id, actor, event)
		}
	}
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
