package outings

import (
	"context"
	"math"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"pulse-api/internal/router"
)

type planReaction struct {
	UserID string `json:"userId"`
	Answer string `json:"answer"`
}
type planDateOption struct {
	Date      string         `json:"date"`
	Responses []planReaction `json:"responses"`
}
type previousPlanEvent struct {
	EventID   string    `json:"eventId"`
	Title     string    `json:"title"`
	ChangedAt time.Time `json:"changedAt"`
}

func validPlanAnswer(answer string) bool {
	return answer == "yes" || answer == "maybe" || answer == "no"
}
func nightBounds(day string) (time.Time, time.Time, error) {
	start, err := time.ParseInLocation("2006-01-02 15:04", day+" 06:00", planningZone)
	return start, start.AddDate(0, 0, 1), err
}
func validDecisionAt(at time.Time, lastDay string) bool {
	_, end, err := nightBounds(lastDay)
	return err == nil && at.After(time.Now()) && at.Before(end)
}

type lockedPlanning struct {
	id, owner, chosen pgtype.UUID
	day               string
	deadline          *time.Time
	revision          int64
	reopened          *int64
}

func lockPlanning(ctx context.Context, tx pgx.Tx, id, actor pgtype.UUID) (lockedPlanning, error) {
	p := lockedPlanning{id: id}
	if err := lockGroupForPlan(ctx, tx, id, actor); err != nil {
		return p, err
	}
	err := tx.QueryRow(ctx, `SELECT p.owner_id,p.chosen_event_id,COALESCE(p.outing_date::text,''),p.decision_at,p.revision,p.reopened_from_revision
  FROM outing_plans p JOIN outing_plan_members m ON m.plan_id=p.id JOIN users u ON u.id=m.user_id AND u.is_active
  WHERE p.id=$1 AND m.user_id=$2 AND m.status='accepted' AND p.expires_at>CURRENT_TIMESTAMP FOR UPDATE OF p,m`, id, actor).
		Scan(&p.owner, &p.chosen, &p.day, &p.deadline, &p.revision, &p.reopened)
	return p, err
}
func (h *Handler) planningMutation(w http.ResponseWriter, r *http.Request, actor pgtype.UUID, action string) error {
	id, err := uuid(chi.URLParam(r, "planID"))
	if err != nil {
		return err
	}
	var req struct {
		Date       string     `json:"date,omitempty"`
		Answer     string     `json:"answer,omitempty"`
		BudgetRon  *float64   `json:"budgetRon,omitempty"`
		DecisionAt *time.Time `json:"decisionAt,omitempty"`
		Revision   int64      `json:"revision,omitempty"`
		Reason     string     `json:"reason,omitempty"`
		Place      string     `json:"place,omitempty"`
		At         *time.Time `json:"at,omitempty"`
		Status     string     `json:"status,omitempty"`
	}
	if err = body(r, &req); err != nil {
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
	owner := p.owner == actor
	votingClosed := p.deadline != nil && !p.deadline.After(time.Now())
	switch action {
	case "availability":
		if p.chosen.Valid || p.day != "" && p.day != req.Date {
			return conflict("DATE_DECIDED")
		}
		if votingClosed {
			return conflict("VOTING_CLOSED")
		}
		if !validPlanAnswer(req.Answer) {
			return invalid("INVALID_REACTION")
		}
		var exists bool
		if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM outing_plan_dates WHERE plan_id=$1 AND outing_date=$2::date)`, id, req.Date).Scan(&exists); err != nil {
			return invalid("INVALID_PLAN_CONTEXT")
		}
		if !exists || !validPlanningDate(req.Date, time.Now()) {
			return invalid("INVALID_PLAN_CONTEXT")
		}
		_, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_availability(plan_id,outing_date,user_id,answer) VALUES($1,$2::date,$3,$4)
   ON CONFLICT(plan_id,outing_date,user_id) DO UPDATE SET answer=EXCLUDED.answer WHERE outing_plan_availability.answer IS DISTINCT FROM EXCLUDED.answer`, id, req.Date, actor, req.Answer)
	case "date":
		if !owner {
			return missing()
		}
		if p.chosen.Valid {
			return conflict("PLAN_DECIDED")
		}
		if p.day != "" && p.day != req.Date {
			return conflict("DATE_DECIDED")
		}
		var exists bool
		if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM outing_plan_dates WHERE plan_id=$1 AND outing_date=$2::date)`, id, req.Date).Scan(&exists); err != nil {
			return invalid("INVALID_PLAN_CONTEXT")
		}
		if !exists || !validPlanningDate(req.Date, time.Now()) {
			return invalid("INVALID_PLAN_CONTEXT")
		}
		var duplicate bool
		if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM outing_plans other JOIN outing_plans current ON current.group_id=other.group_id WHERE current.id=$1 AND other.id<>$1 AND other.outing_date=$2::date)`, id, req.Date).Scan(&duplicate); err != nil {
			return err
		}
		if duplicate {
			return conflict("OUTING_EXISTS")
		}
		_, err = tx.Exec(r.Context(), `UPDATE outing_plans SET outing_date=$2::date,expires_at=(($2::date+1)::timestamp+interval '6 hours') AT TIME ZONE 'Europe/Bucharest' WHERE id=$1 AND outing_date IS DISTINCT FROM $2::date`, id, req.Date)
	case "preferences":
		var bani any
		if req.BudgetRon != nil {
			amount := *req.BudgetRon * 100
			if math.IsNaN(amount) || math.IsInf(amount, 0) || amount < 0 || amount > 100000000 || math.Abs(amount-math.Round(amount)) > 0.000001 {
				return invalid("INVALID_BUDGET")
			}
			bani = int64(math.Round(amount))
		}
		_, err = tx.Exec(r.Context(), `UPDATE outing_plan_members SET budget_bani=$3 WHERE plan_id=$1 AND user_id=$2 AND budget_bani IS DISTINCT FROM $3::integer`, id, actor, bani)
	case "deadline":
		if !owner {
			return missing()
		}
		if p.chosen.Valid {
			return conflict("PLAN_DECIDED")
		}
		var lastDay string
		if err = tx.QueryRow(r.Context(), `SELECT COALESCE(MAX(outing_date)::text,$2) FROM outing_plan_dates WHERE plan_id=$1`, id, p.day).Scan(&lastDay); err != nil {
			return err
		}
		if req.DecisionAt == nil || !validDecisionAt(*req.DecisionAt, lastDay) {
			return invalid("INVALID_DEADLINE")
		}
		_, err = tx.Exec(r.Context(), `UPDATE outing_plans SET decision_at=$2,deadline_reminded_at=NULL,deadline_closed_notified_at=NULL WHERE id=$1 AND decision_at IS DISTINCT FROM $2`, id, req.DecisionAt)
	case "reopen":
		if !owner {
			return missing()
		}
		if !p.chosen.Valid && p.reopened != nil && *p.reopened == req.Revision {
			router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
			return nil
		}
		if req.Revision != p.revision {
			return conflict("PLAN_CHANGED")
		}
		if !p.chosen.Valid {
			return conflict("PLAN_NOT_DECIDED")
		}
		if req.Reason != "sold_out" && req.Reason != "cancelled" && req.Reason != "other" {
			return invalid("INVALID_REQUEST")
		}
		_, end, e := nightBounds(p.day)
		if e != nil || !end.After(time.Now()) {
			return conflict("EVENT_UNAVAILABLE")
		}
		if _, err = tx.Exec(r.Context(), `UPDATE outing_plan_decisions SET reopened_at=CURRENT_TIMESTAMP,reopen_reason=$2
    WHERE plan_id=$1 AND round=(SELECT decision_round FROM outing_plans WHERE id=$1) AND reopened_at IS NULL`, id, req.Reason); err != nil {
			return err
		}
		if _, err = tx.Exec(r.Context(), `UPDATE outing_plans SET chosen_event_id=NULL,decision_round=decision_round+1,reopened_from_revision=$2,
    decision_at=NULL,deadline_reminded_at=NULL,deadline_closed_notified_at=NULL,meeting_point=NULL,meeting_at=NULL WHERE id=$1`, id, req.Revision); err != nil {
			return err
		}
		if _, err = tx.Exec(r.Context(), `DELETE FROM outing_plan_votes WHERE plan_id=$1`, id); err != nil {
			return err
		}
		// Personal preferences remain historical; only attendance is versioned.
		if _, err = tx.Exec(r.Context(), `UPDATE outing_plan_members SET arrival_status='not_set',arrival_updated_at=NULL,needs_ticket=FALSE WHERE plan_id=$1`, id); err != nil {
			return err
		}
		err = notifyGroupDecision(r.Context(), tx, id, actor, pgtype.UUID{}, "friend_group_changed")
	case "meeting":
		if !owner {
			return missing()
		}
		if !p.chosen.Valid {
			return conflict("PLAN_NOT_DECIDED")
		}
		req.Place = strings.TrimSpace(req.Place)
		if utf8.RuneCountInString(req.Place) > 160 || req.Place == "" && req.At != nil {
			return invalid("INVALID_MEETING")
		}
		if req.At != nil {
			start, end, e := nightBounds(p.day)
			if e != nil || req.At.Before(start) || !req.At.Before(end) {
				return invalid("INVALID_MEETING")
			}
		}
		_, err = tx.Exec(r.Context(), `UPDATE outing_plans SET meeting_point=NULLIF($2,''),meeting_at=$3 WHERE id=$1`, id, req.Place, req.At)
	case "arrival":
		if !p.chosen.Valid {
			return conflict("PLAN_NOT_DECIDED")
		}
		switch req.Status {
		case "not_set", "leaving_soon", "on_way", "arrived", "not_coming":
		default:
			return invalid("INVALID_REQUEST")
		}
		_, err = tx.Exec(r.Context(), `UPDATE outing_plan_members SET arrival_status=$3,arrival_updated_at=CURRENT_TIMESTAMP
    WHERE plan_id=$1 AND user_id=$2 AND arrival_status IS DISTINCT FROM $3`, id, actor, req.Status)
	default:
		return invalid("INVALID_REQUEST")
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
