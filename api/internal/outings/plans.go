package outings

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"pulse-api/internal/common"
	"pulse-api/internal/router"
)

const maxPlanProposals = 8

type queryer interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}
type planMember struct {
	Attendance         string     `json:"attendance,omitempty"`
	TicketState        string     `json:"ticketState,omitempty"`
	UserID             string     `json:"userId"`
	Username           string     `json:"username"`
	Status             string     `json:"status"`
	VoteEventID        string     `json:"voteEventId,omitempty"`
	HasTicket          *bool      `json:"hasTicket,omitempty"`
	NeedsTicket        bool       `json:"needsTicket,omitempty"`
	TicketStatusShared bool       `json:"ticketStatusShared,omitempty"`
	AvatarURL          string     `json:"avatarUrl,omitempty"`
	HasPreviousTicket  bool       `json:"hasPreviousTicket,omitempty"`
	ArrivalStatus      string     `json:"arrivalStatus,omitempty"`
	ArrivalUpdatedAt   *time.Time `json:"arrivalUpdatedAt,omitempty"`
}
type planOption struct {
	EventStatus        string         `json:"eventStatus,omitempty"`
	EventID            string         `json:"eventId"`
	Title              string         `json:"title"`
	Location           string         `json:"location"`
	StartTime          time.Time      `json:"startTime"`
	Available          bool           `json:"available"`
	ProposedBy         string         `json:"proposedBy,omitempty"`
	PriceRon           *float64       `json:"priceRon,omitempty"`
	TicketAvailability string         `json:"ticketAvailability,omitempty"`
	ImageURL           string         `json:"imageUrl,omitempty"`
	TotalPriceRon      *float64       `json:"totalPriceRon,omitempty"`
	BudgetFits         int            `json:"budgetFits"`
	Reactions          []planReaction `json:"reactions"`
}
type plan struct {
	GroupID                string              `json:"groupId,omitempty"`
	Lifecycle              string              `json:"lifecycle,omitempty"`
	ConfirmedCount         int                 `json:"confirmedCount"`
	ReadyCount             int                 `json:"readyCount"`
	AllConfirmedReady      bool                `json:"allConfirmedReady"`
	GiftPurchasesAvailable *bool               `json:"giftPurchasesAvailable,omitempty"`
	MyPendingPayment       *pendingPlanPayment `json:"myPendingPayment,omitempty"`
	ID                     string              `json:"id"`
	OwnerID                string              `json:"ownerId"`
	Title                  string              `json:"title"`
	Status                 string              `json:"status"`
	OutingDate             string              `json:"outingDate,omitempty"`
	City                   string              `json:"city,omitempty"`
	ChosenEventID          string              `json:"chosenEventId,omitempty"`
	ExpiresAt              time.Time           `json:"expiresAt"`
	CreatedAt              time.Time           `json:"createdAt"`
	Members                []planMember        `json:"members"`
	Options                []planOption        `json:"options"`
	Revision               int64               `json:"revision"`
	CandidateDates         []planDateOption    `json:"candidateDates"`
	DecisionAt             *time.Time          `json:"decisionAt,omitempty"`
	MyBudgetRon            *float64            `json:"myBudgetRon,omitempty"`
	BudgetCount            int                 `json:"budgetCount"`
	PreviousEvents         []previousPlanEvent `json:"previousEvents"`
	MeetingPoint           string              `json:"meetingPoint,omitempty"`
	MeetingAt              *time.Time          `json:"meetingAt,omitempty"`
	InviterName            string              `json:"inviterName,omitempty"`
	InviterAvatar          string              `json:"inviterAvatar,omitempty"`
	DecisionRound          int                 `json:"decisionRound"`
}
type pendingPlanPayment struct {
	OrderID   string `json:"orderId"`
	SessionID string `json:"sessionId,omitempty"`
}

var planningZone = common.BucharestZone

func canonicalCity(value string) string { return common.CanonicalPlanningCity(value) }
func validPlanningDate(value string, now time.Time) bool {
	day, err := time.ParseInLocation("2006-01-02", value, planningZone)
	if err != nil || day.Format("2006-01-02") != value {
		return false
	}
	local := now.In(planningZone)
	if local.Hour() < 6 {
		local = local.AddDate(0, 0, -1)
	}
	today, _ := time.ParseInLocation("2006-01-02", local.Format("2006-01-02"), planningZone)
	return !day.Before(today) && !day.After(today.AddDate(0, 0, 365))
}

// Only the current holder of an unrefunded admission has preparation rights.
const memberAdmissionSQL = `SELECT EXISTS(
    SELECT 1 FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=o.event_id
    WHERE t.user_id=$1 AND o.event_id=$2 AND o.status='completed'
      AND o.stripe_refund_status='none' AND o.stripe_amount_refunded_bani=0 AND NOT o.stripe_refund_needs_attention
      AND NOT EXISTS(SELECT 1 FROM order_refund_operations rf WHERE rf.order_id=o.id)
      AND NOT EXISTS(SELECT 1 FROM outing_ticket_recipients a JOIN ticket_transfers x ON x.ticket_id=a.ticket_id WHERE a.ticket_id=t.id AND a.recipient_id<>t.user_id AND x.status='pending' AND x.expires_at>CURRENT_TIMESTAMP)
      AND e.status='published' AND e.end_time>CURRENT_TIMESTAMP)`

func readPlan(ctx context.Context, q queryer, id, actor pgtype.UUID) (plan, error) {
	p := plan{Members: []planMember{}, Options: []planOption{}}
	if err := groupPlanAccess(ctx, q, id, actor); err != nil {
		return p, err
	}
	var chosen pgtype.UUID
	err := q.QueryRow(ctx, `SELECT p.id::text,COALESCE(p.owner_id::text,''),p.title,m.status,p.chosen_event_id,p.expires_at,
        COALESCE(p.outing_date::text,''),COALESCE(p.city,''),COALESCE(p.group_id::text,''),p.created_at
        FROM outing_plans p JOIN outing_plan_members m ON m.plan_id=p.id
        JOIN users u ON u.id=m.user_id AND u.is_active
        WHERE p.id=$1 AND m.user_id=$2 AND m.status<>'declined'`, id, actor).
		Scan(&p.ID, &p.OwnerID, &p.Title, &p.Status, &chosen, &p.ExpiresAt, &p.OutingDate, &p.City, &p.GroupID, &p.CreatedAt)
	if err != nil {
		return p, err
	}
	if err = loadPlanContext(ctx, q, id, &p); err != nil {
		return p, err
	}
	if err = q.QueryRow(ctx, `SELECT u.username,COALESCE(u.avatar_url,''),p.decision_round FROM outing_plans p JOIN users u ON u.id=p.owner_id WHERE p.id=$1`, id).Scan(&p.InviterName, &p.InviterAvatar, &p.DecisionRound); err != nil {
		return p, err
	}
	// An invitation reveals its context, never the group's members, votes or admissions.
	if p.Status != "accepted" {
		if chosen.Valid {
			p.ChosenEventID = sid(chosen)
			option := planOption{EventID: sid(chosen), Reactions: []planReaction{}}
			if err = q.QueryRow(ctx, `SELECT title,location_name,start_time,COALESCE(banner_url,''),status='published' AND end_time>CURRENT_TIMESTAMP,status::text FROM events WHERE id=$1`, chosen).Scan(&option.Title, &option.Location, &option.StartTime, &option.ImageURL, &option.Available, &option.EventStatus); err != nil {
				return p, err
			}
			p.Options = append(p.Options, option)
		}
		return p, nil
	}
	if chosen.Valid {
		p.ChosenEventID = sid(chosen)
	}
	rows, err := q.Query(ctx, `SELECT m.user_id,u.username,m.status,COALESCE(v.event_id::text,'')
        FROM outing_plan_members m JOIN users u ON u.id=m.user_id AND u.is_active
        LEFT JOIN outing_plan_votes v ON v.plan_id=m.plan_id AND v.user_id=m.user_id
        WHERE m.plan_id=$1 AND m.status<>'declined' ORDER BY u.username,m.user_id`, id)
	if err != nil {
		return p, err
	}
	var memberIDs []pgtype.UUID
	for rows.Next() {
		var m planMember
		var memberID pgtype.UUID
		if err = rows.Scan(&memberID, &m.Username, &m.Status, &m.VoteEventID); err != nil {
			break
		}
		m.UserID = sid(memberID)
		memberIDs = append(memberIDs, memberID)
		p.Members = append(p.Members, m)
	}
	rows.Close()
	if err != nil {
		return p, err
	}
	if rows.Err() != nil {
		return p, rows.Err()
	}
	if chosen.Valid && p.GroupID == "" {
		for i := range p.Members {
			if p.Members[i].Status != "accepted" {
				continue
			}
			var has bool
			var shared bool
			if err = q.QueryRow(ctx, `SELECT ticket_status_shared,needs_ticket FROM outing_plan_members WHERE plan_id=$1 AND user_id=$2`, id, memberIDs[i]).Scan(&shared, &p.Members[i].NeedsTicket); err != nil {
				return p, err
			}
			if memberIDs[i] != actor && !shared {
				continue
			}
			if memberIDs[i] == actor {
				p.Members[i].TicketStatusShared = shared
			}
			if err = q.QueryRow(ctx, memberAdmissionSQL, memberIDs[i], chosen).Scan(&has); err != nil {
				return p, err
			}
			p.Members[i].HasTicket = &has
		}
	}
	rows, err = q.Query(ctx, `SELECT e.id::text,e.title,e.location_name,e.start_time,
        e.status='published' AND e.end_time>CURRENT_TIMESTAMP
          AND (p.city IS NULL OR translate(lower(btrim(normalize(e.city,NFC))),'ăâîșşțţ','aaisstt')=translate(lower(btrim(normalize(p.city,NFC))),'ăâîșşțţ','aaisstt'))
          AND ((p.group_id IS NULL AND p.outing_date IS NULL) OR (p.outing_date IS NOT NULL AND ((e.start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date=p.outing_date)),
        COALESCE(o.proposed_by::text,''),e.status::text,
        pricing.price,
        CASE WHEN e.status<>'published' OR e.end_time<=CURRENT_TIMESTAMP THEN 'unavailable'
          WHEN e.external_ticket_url IS NOT NULL THEN 'external'
          WHEN pricing.on_sale THEN 'on_sale'
          WHEN pricing.upcoming THEN 'upcoming'
          WHEN pricing.stock THEN 'sales_ended'
          WHEN pricing.total>0 THEN 'sold_out' ELSE 'unavailable' END
        FROM outing_plan_options o JOIN outing_plans p ON p.id=o.plan_id JOIN events e ON e.id=o.event_id
        CROSS JOIN LATERAL (SELECT min(tt.price_ron)::float8 price,count(*) total,
          COALESCE(bool_or(tt.capacity>tt.tickets_sold),FALSE) stock,
          COALESCE(bool_or(tt.capacity>tt.tickets_sold AND tt.start_sales<=CURRENT_TIMESTAMP AND tt.end_sales>CURRENT_TIMESTAMP),FALSE) on_sale,
          COALESCE(bool_or(tt.capacity>tt.tickets_sold AND tt.start_sales>CURRENT_TIMESTAMP AND tt.end_sales>tt.start_sales),FALSE) upcoming
          FROM ticket_types tt WHERE tt.event_id=e.id) pricing
        WHERE o.plan_id=$1 ORDER BY o.position`, id)
	if err != nil {
		return p, err
	}
	defer rows.Close()
	for rows.Next() {
		var option planOption
		if err = rows.Scan(&option.EventID, &option.Title, &option.Location, &option.StartTime, &option.Available, &option.ProposedBy, &option.EventStatus, &option.PriceRon, &option.TicketAvailability); err != nil {
			return p, err
		}
		p.Options = append(p.Options, option)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return p, err
	}
	if p.GroupID != "" {
		err = loadPermanentPlanDetails(ctx, q, id, actor, &p)
	} else {
		err = loadPlanDetails(ctx, q, id, actor, &p)
	}
	if err == nil {
		err = loadGroupPlanBatched(ctx, q, id, actor, &p)
	}
	return p, err
}
func (h *Handler) listPlans(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	rows, err := h.Pool.Query(r.Context(), `SELECT p.id FROM outing_plan_members m JOIN outing_plans p ON p.id=m.plan_id
        WHERE m.user_id=$1 AND m.status<>'declined' ORDER BY p.created_at DESC LIMIT 50`, actor)
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
	tx, err := h.Pool.BeginTx(r.Context(), pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	p, err := readPlan(r.Context(), tx, id, actor)
	if err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	router.RespondWithJSON(w, 200, p)
	return nil
}
func eventFitsPlan(ctx context.Context, q queryer, event pgtype.UUID, day, city string) (bool, error) {
	var ok bool
	err := q.QueryRow(ctx, `SELECT status='published' AND end_time>CURRENT_TIMESTAMP
        AND translate(lower(btrim(normalize(city,NFC))),'ăâîșşțţ','aaisstt')=translate(lower(btrim(normalize($3::text,NFC))),'ăâîșşțţ','aaisstt') AND ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date=$2::date
        FROM events WHERE id=$1`, event, day, city).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return ok, err
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
func (h *Handler) propose(w http.ResponseWriter, r *http.Request, actor pgtype.UUID) error {
	return h.changePlan(w, r, actor, "propose")
}

func (h *Handler) changePlan(w http.ResponseWriter, r *http.Request, actor pgtype.UUID, action string) error {
	id, err := uuid(chi.URLParam(r, "planID"))
	if err != nil {
		return err
	}
	var req struct {
		Status   string `json:"status,omitempty"`
		Revision int64  `json:"revision,omitempty"`
		EventID  string `json:"eventId,omitempty"`
		Answer   string `json:"answer,omitempty"`
		Remove   bool   `json:"remove,omitempty"`
	}
	if err = body(r, &req); err != nil {
		return err
	}
	tx, err := h.Pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	if err = lockGroupForPlan(r.Context(), tx, id, actor); err != nil {
		return err
	}
	var owner, chosen pgtype.UUID
	var status, day, city string
	var deadline *time.Time
	var revision int64
	err = tx.QueryRow(r.Context(), `SELECT p.owner_id,p.chosen_event_id,m.status,COALESCE(p.outing_date::text,''),COALESCE(p.city,'')
        ,p.decision_at,p.revision
        FROM outing_plans p JOIN outing_plan_members m ON m.plan_id=p.id JOIN users u ON u.id=m.user_id AND u.is_active
        WHERE p.id=$1 AND m.user_id=$2 AND p.expires_at>CURRENT_TIMESTAMP FOR UPDATE OF p,m`, id, actor).Scan(&owner, &chosen, &status, &day, &city, &deadline, &revision)
	if err != nil {
		return err
	}
	if req.Revision > 0 && req.Revision != revision {
		return conflict("PLAN_CHANGED")
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
		if status != "accepted" || action == "choose" && owner != actor {
			return missing()
		}
		event, e := uuid(req.EventID)
		if e != nil {
			return e
		}
		if chosen.Valid && action != "propose" && action != "remove_proposal" {
			if action == "choose" && chosen == event {
				router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
				return nil
			}
			return conflict("PLAN_DECIDED")
		}
		if day == "" || city == "" {
			return conflict("INVALID_PLAN_CONTEXT")
		}
		if action != "choose" && action != "remove_proposal" && !chosen.Valid && deadline != nil && !deadline.After(time.Now()) {
			return conflict("VOTING_CLOSED")
		}
		ok, e := eventFitsPlan(r.Context(), tx, event, day, city)
		if e != nil {
			return e
		}
		if !ok && action != "remove_proposal" {
			return conflict("EVENT_UNAVAILABLE")
		}
		var exists bool
		if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM outing_plan_options WHERE plan_id=$1 AND event_id=$2)`, id, event).Scan(&exists); err != nil {
			return err
		}
		switch action {
		case "propose":
			if !exists {
				var count int
				if err = tx.QueryRow(r.Context(), `SELECT count(*) FROM outing_plan_options WHERE plan_id=$1`, id).Scan(&count); err != nil {
					return err
				}
				if count >= maxPlanProposals {
					return conflict("PROPOSAL_LIMIT")
				}
				_, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_options(plan_id,event_id,position,proposed_by)
 SELECT $1,$2,MIN(slot),$3 FROM generate_series(0,7) slot WHERE NOT EXISTS(SELECT 1 FROM outing_plan_options used WHERE used.plan_id=$1 AND used.position=slot)`, id, event, actor)
			}
		case "remove_proposal":
			if chosen == event {
				return conflict("PLAN_DECIDED")
			}
			if !exists {
				router.RespondWithJSON(w, 200, map[string]bool{"ok": true})
				return nil
			}
			result, e := tx.Exec(r.Context(), `DELETE FROM outing_plan_options WHERE plan_id=$1 AND event_id=$2 AND ($3=$4 OR proposed_by=$3)`, id, event, actor, owner)
			if e != nil {
				return e
			}
			if result.RowsAffected() == 0 {
				return missing()
			}
		case "choose":
			if !exists {
				return conflict("EVENT_UNAVAILABLE")
			}
			if _, err = tx.Exec(r.Context(), `UPDATE outing_plans SET chosen_event_id=$2,expires_at=(SELECT end_time FROM events WHERE id=$2),destination_start_time=(SELECT start_time FROM events WHERE id=$2),destination_location=(SELECT location_name FROM events WHERE id=$2) WHERE id=$1`, id, event); err != nil {
				return err
			}
			if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_decisions(plan_id,round,event_id) SELECT id,decision_round,$2 FROM outing_plans WHERE id=$1`, id, event); err != nil {
				return err
			}
			err = notifyGroupDecision(r.Context(), tx, id, actor, event, "friend_group_chosen")
		default:
			if !exists {
				return conflict("EVENT_UNAVAILABLE")
			}
			// A toggle-off removes only this member's preference for this event.
			// It does not turn an unanswered preference into a negative answer,
			// clear their other choices, or create an attendance response.
			if req.Remove {
				if req.Answer != "" {
					return invalid("INVALID_REACTION")
				}
				if _, err = tx.Exec(r.Context(), `DELETE FROM outing_plan_reactions WHERE plan_id=$1 AND user_id=$2 AND event_id=$3`, id, actor, event); err != nil {
					return err
				}
				_, err = tx.Exec(r.Context(), `DELETE FROM outing_plan_votes WHERE plan_id=$1 AND user_id=$2 AND event_id=$3`, id, actor, event)
				break
			}
			if req.Answer != "" && !validPlanAnswer(req.Answer) {
				return invalid("INVALID_REACTION")
			}
			if req.Answer == "" {
				if _, err = tx.Exec(r.Context(), `DELETE FROM outing_plan_reactions WHERE plan_id=$1 AND user_id=$2`, id, actor); err != nil {
					return err
				}
				req.Answer = "yes"
			}
			if _, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_reactions(plan_id,event_id,user_id,answer) VALUES($1,$2,$3,$4)
              ON CONFLICT(plan_id,event_id,user_id) DO UPDATE SET answer=EXCLUDED.answer`, id, event, actor, req.Answer); err != nil {
				return err
			}
			if req.Answer != "yes" {
				_, err = tx.Exec(r.Context(), `DELETE FROM outing_plan_votes WHERE plan_id=$1 AND user_id=$2 AND event_id=$3`, id, actor, event)
				break
			}
			_, err = tx.Exec(r.Context(), `INSERT INTO outing_plan_votes(plan_id,user_id,event_id) VALUES($1,$2,$3)
                ON CONFLICT(plan_id,user_id) DO UPDATE SET event_id=EXCLUDED.event_id`, id, actor, event)
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
