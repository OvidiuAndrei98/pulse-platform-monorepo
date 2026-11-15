package outings

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"pulse-api/internal/router"
)

type contextImpact struct {
	AvailabilityResponses int  `json:"availabilityResponses"`
	EventPreferences      int  `json:"eventPreferences"`
	AttendanceResponses   int  `json:"attendanceResponses"`
	ProposalsKept         int  `json:"proposalsKept"`
	ProposalsIncompatible int  `json:"proposalsIncompatible"`
	DestinationCleared    bool `json:"destinationCleared"`
	TicketsUnaffected     bool `json:"ticketsUnaffected"`
}
type contextConflict struct {
	Code           string
	ExistingPlanID string
	Impact         *contextImpact
}

func (e contextConflict) Error() string { return e.Code }

type contextRequest struct {
	Revision      int64    `json:"revision"`
	City          string   `json:"city"`
	Date          string   `json:"date,omitempty"`
	Dates         []string `json:"dates,omitempty"`
	Title         *string  `json:"title,omitempty"`
	ConfirmImpact bool     `json:"confirmImpact,omitempty"`
}

func (h *Handler) editContext(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	id, err := uuid(chi.URLParam(r, "planID"))
	if err != nil {
		return err
	}
	var req contextRequest
	if err = body(r, &req); err != nil {
		return err
	}
	if req.Revision < 1 {
		return invalid("INVALID_REVISION")
	}
	req.City = canonicalCity(req.City)
	if req.City == "" {
		return invalid("INVALID_PLAN_CONTEXT")
	}
	if req.Date != "" && len(req.Dates) > 0 {
		return invalid("INVALID_PLAN_CONTEXT")
	}
	dates := slices.Clone(req.Dates)
	if req.Date != "" {
		dates = []string{req.Date}
	}
	if len(dates) < 1 || len(dates) > 3 {
		return invalid("INVALID_PLAN_CONTEXT")
	}
	slices.Sort(dates)
	for i, day := range dates {
		if !validPlanningDate(day, time.Now()) || i > 0 && day == dates[i-1] {
			return invalid("INVALID_PLAN_CONTEXT")
		}
	}
	day := ""
	if len(dates) == 1 {
		day = dates[0]
	}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		req.Title = &title
		if utf8.RuneCountInString(title) < 1 || utf8.RuneCountInString(title) > 80 {
			return invalid("INVALID_TITLE")
		}
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	if err = lockGroupForPlan(r.Context(), tx, id, actor); err != nil {
		return err
	}
	var owner, group, chosen pgtype.UUID
	var oldDay, oldCity, title string
	var revision int64
	var round int
	var expiry time.Time
	err = tx.QueryRow(r.Context(), `SELECT owner_id,group_id,chosen_event_id,COALESCE(outing_date::text,''),COALESCE(city,''),title,revision,decision_round,expires_at FROM outing_plans WHERE id=$1 FOR UPDATE`, id).Scan(&owner, &group, &chosen, &oldDay, &oldCity, &title, &revision, &round, &expiry)
	if err != nil {
		return err
	}
	if owner != actor {
		return fault{403, "OUTING_EDIT_FORBIDDEN"}
	}
	if !expiry.After(time.Now()) {
		return conflict("OUTING_COMPLETED")
	}
	rows, err := tx.Query(r.Context(), `SELECT outing_date::text FROM outing_plan_dates WHERE plan_id=$1 ORDER BY outing_date`, id)
	if err != nil {
		return err
	}
	oldDates := []string{}
	for rows.Next() {
		var value string
		if err = rows.Scan(&value); err != nil {
			break
		}
		oldDates = append(oldDates, value)
	}
	rows.Close()
	if err != nil {
		return err
	}
	if err = rows.Err(); err != nil {
		return err
	}
	if oldDay != "" {
		oldDates = []string{oldDay}
	}
	targetTitle := title
	if req.Title != nil {
		targetTitle = *req.Title
	} else if title == oldDay || len(oldDates) > 0 && title == oldDates[0] {
		targetTitle = dates[0]
	}
	material := day != oldDay || req.City != canonicalCity(oldCity) || !slices.Equal(dates, oldDates)
	fingerprint := groupFingerprint([]any{req.City, day, dates, targetTitle})
	if revision != req.Revision {
		// A lost acknowledgement may retry the same semantic update. It must never
		// reapply its resets or notifications, nor overwrite a newer correction.
		var original string
		err = tx.QueryRow(r.Context(), `SELECT request_fingerprint FROM outing_plan_context_history WHERE plan_id=$1 AND from_revision=$2`, id, req.Revision).Scan(&original)
		if !errors.Is(err, pgx.ErrNoRows) && err != nil {
			return err
		}
		if original != fingerprint || material || title != targetTitle {
			return conflict("PLAN_CHANGED")
		}
		return respondContext(r.Context(), tx, w, id, actor)
	}
	if !material {
		if title != targetTitle {
			if _, err = tx.Exec(r.Context(), `UPDATE outing_plans SET title=$2 WHERE id=$1`, id, targetTitle); err != nil {
				return err
			}
		}
		return respondContext(r.Context(), tx, w, id, actor)
	}
	if day != "" {
		var existing pgtype.UUID
		err = tx.QueryRow(r.Context(), `SELECT id FROM outing_plans WHERE group_id=$1 AND id<>$2 AND outing_date=$3::date`, group, id, day).Scan(&existing)
		if err == nil {
			return contextConflict{Code: "OUTING_EXISTS", ExistingPlanID: sid(existing)}
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}
	impact := contextImpact{TicketsUnaffected: true}
	err = tx.QueryRow(r.Context(), `SELECT (SELECT count(*) FROM outing_plan_availability WHERE plan_id=$1),(SELECT count(*) FROM outing_plan_reactions WHERE plan_id=$1),(SELECT count(*) FROM outing_attendance WHERE plan_id=$1 AND decision_round=$2)`, id, round).Scan(&impact.AvailabilityResponses, &impact.EventPreferences, &impact.AttendanceResponses)
	if err != nil {
		return err
	}
	rows, err = tx.Query(r.Context(), `SELECT event_id FROM outing_plan_options WHERE plan_id=$1`, id)
	if err != nil {
		return err
	}
	options := []pgtype.UUID{}
	for rows.Next() {
		var event pgtype.UUID
		if err = rows.Scan(&event); err != nil {
			break
		}
		options = append(options, event)
	}
	rows.Close()
	if err != nil {
		return err
	}
	if err = rows.Err(); err != nil {
		return err
	}
	chosenFits := !chosen.Valid
	for _, event := range options {
		fits := false
		if day != "" {
			fits, err = eventFitsPlan(r.Context(), tx, event, day, req.City)
			if err != nil {
				return err
			}
		}
		if fits {
			impact.ProposalsKept++
		} else {
			impact.ProposalsIncompatible++
		}
		if event == chosen {
			chosenFits = fits
		}
	}
	impact.DestinationCleared = chosen.Valid && !chosenFits
	if !req.ConfirmImpact && (len(options) > 0 || impact.AvailabilityResponses > 0 || impact.EventPreferences > 0 || impact.AttendanceResponses > 0 || chosen.Valid) {
		return contextConflict{Code: "CONTEXT_CONFIRMATION_REQUIRED", Impact: &impact}
	}
	// Archive old answers before clearing only their current projection. Orders,
	// tickets, transfer offers and shared conversation messages are untouched.
	_, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_context_history(plan_id,actor_id,from_revision,request_fingerprint,snapshot)
 SELECT p.id,$2,$3,$4,jsonb_build_object('context',to_jsonb(p),'dates',COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM outing_plan_dates d WHERE d.plan_id=p.id),'[]'::jsonb),'availability',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM outing_plan_availability a WHERE a.plan_id=p.id),'[]'::jsonb),'preferences',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM outing_plan_reactions a WHERE a.plan_id=p.id),'[]'::jsonb),'attendance',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM outing_attendance a WHERE a.plan_id=p.id AND a.decision_round=p.decision_round),'[]'::jsonb),'proposals',COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM outing_plan_options o WHERE o.plan_id=p.id),'[]'::jsonb)) FROM outing_plans p WHERE p.id=$1`, id, actor, req.Revision, fingerprint)
	if err != nil {
		return err
	}
	if chosen.Valid {
		if _, err = tx.Exec(r.Context(), `UPDATE outing_plan_decisions SET reopened_at=clock_timestamp(),reopen_reason='other' WHERE plan_id=$1 AND round=$2 AND reopened_at IS NULL`, id, round); err != nil {
			return err
		}
	}
	for _, sql := range []string{`DELETE FROM outing_plan_availability WHERE plan_id=$1`, `DELETE FROM outing_plan_reactions WHERE plan_id=$1`, `DELETE FROM outing_plan_votes WHERE plan_id=$1`, `DELETE FROM outing_plan_dates WHERE plan_id=$1`} {
		if _, err = tx.Exec(r.Context(), sql, id); err != nil {
			return err
		}
	}
	for _, date := range dates {
		if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_dates(plan_id,outing_date) VALUES($1,$2::date)`, id, date); err != nil {
			return err
		}
	}
	targetChosen := chosen
	if !chosenFits {
		targetChosen = pgtype.UUID{}
	}
	_, nightEnd, err := nightBounds(dates[len(dates)-1])
	if err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), `UPDATE outing_plans SET title=$2,city=$3,outing_date=NULLIF($4,'')::date,chosen_event_id=$5,decision_round=decision_round+1,reopened_from_revision=NULL,decision_at=NULL,deadline_reminded_at=NULL,deadline_closed_notified_at=NULL,expires_at=COALESCE((SELECT end_time FROM events WHERE id=$5),$6),destination_start_time=(SELECT start_time FROM events WHERE id=$5),destination_location=(SELECT location_name FROM events WHERE id=$5) WHERE id=$1`, id, targetTitle, req.City, day, targetChosen, nightEnd); err != nil {
		return err
	}
	if targetChosen.Valid {
		if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_decisions(plan_id,round,event_id) SELECT id,decision_round,$2 FROM outing_plans WHERE id=$1`, id, targetChosen); err != nil {
			return err
		}
	}
	if err = notifyGroupDecision(r.Context(), tx, id, actor, targetChosen, "friend_group_changed"); err != nil {
		return err
	}
	return respondContext(r.Context(), tx, w, id, actor)
}

func respondContext(ctx context.Context, tx pgx.Tx, w http.ResponseWriter, id, actor pgtype.UUID) error {
	p, err := readPlan(ctx, tx, id, actor)
	if err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, p)
	return nil
}
