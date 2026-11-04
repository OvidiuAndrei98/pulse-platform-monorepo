package outings

import (
	"context"
	"github.com/jackc/pgx/v5/pgtype"
)

func loadPlanContext(ctx context.Context, q queryer, id pgtype.UUID, p *plan) error {
	p.CandidateDates = []planDateOption{}
	p.PreviousEvents = []previousPlanEvent{}
	if err := q.QueryRow(ctx, `SELECT revision,decision_at,COALESCE(meeting_point,''),meeting_at FROM outing_plans WHERE id=$1`, id).Scan(&p.Revision, &p.DecisionAt, &p.MeetingPoint, &p.MeetingAt); err != nil {
		return err
	}
	rows, err := q.Query(ctx, `SELECT outing_date::text FROM outing_plan_dates WHERE plan_id=$1 ORDER BY outing_date`, id)
	if err != nil {
		return err
	}
	for rows.Next() {
		var day string
		if err = rows.Scan(&day); err != nil {
			rows.Close()
			return err
		}
		p.CandidateDates = append(p.CandidateDates, planDateOption{day, []planReaction{}})
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if len(p.CandidateDates) == 0 && p.OutingDate != "" {
		p.CandidateDates = append(p.CandidateDates, planDateOption{p.OutingDate, []planReaction{}})
	}
	// Pending invitations may see the proposed nights, never group responses or meetup details.
	if p.Status != "accepted" {
		p.MeetingPoint = ""
		p.MeetingAt = nil
		return nil
	}
	rows, err = q.Query(ctx, `SELECT a.outing_date::text,a.user_id::text,a.answer FROM outing_plan_availability a JOIN outing_plan_members m USING(plan_id,user_id) JOIN users u ON u.id=m.user_id AND u.is_active WHERE a.plan_id=$1 AND m.status='accepted' ORDER BY a.user_id`, id)
	if err != nil {
		return err
	}
	for rows.Next() {
		var day string
		var reaction planReaction
		if err = rows.Scan(&day, &reaction.UserID, &reaction.Answer); err != nil {
			rows.Close()
			return err
		}
		for i := range p.CandidateDates {
			if p.CandidateDates[i].Date == day {
				p.CandidateDates[i].Responses = append(p.CandidateDates[i].Responses, reaction)
			}
		}
	}
	err = rows.Err()
	rows.Close()
	return err
}

func loadPlanDetails(ctx context.Context, q queryer, id, actor pgtype.UUID, p *plan) error {
	var budget *int
	if err := q.QueryRow(ctx, `SELECT budget_bani FROM outing_plan_members WHERE plan_id=$1 AND user_id=$2`, id, actor).Scan(&budget); err != nil {
		return err
	}
	if budget != nil {
		value := float64(*budget) / 100
		p.MyBudgetRon = &value
	}
	if err := q.QueryRow(ctx, `SELECT count(*) FROM outing_plan_members m JOIN users u ON u.id=m.user_id AND u.is_active WHERE plan_id=$1 AND status='accepted' AND budget_bani IS NOT NULL`, id).Scan(&p.BudgetCount); err != nil {
		return err
	}
	for i := range p.Members {
		m := &p.Members[i]
		if err := q.QueryRow(ctx, `SELECT COALESCE(u.avatar_url,''),m.arrival_status,m.arrival_updated_at,
    EXISTS(SELECT 1 FROM outing_plan_decisions d JOIN orders o ON o.event_id=d.event_id JOIN tickets t ON t.order_id=o.id
      WHERE d.plan_id=m.plan_id AND d.reopened_at IS NOT NULL AND t.user_id=m.user_id AND o.status='completed'
      AND o.stripe_refund_status='none' AND o.stripe_amount_refunded_bani=0 AND NOT o.stripe_refund_needs_attention
      AND NOT EXISTS(SELECT 1 FROM order_refund_operations rf WHERE rf.order_id=o.id))
    FROM outing_plan_members m JOIN users u ON u.id=m.user_id WHERE m.plan_id=$1 AND m.user_id=$2`, id, m.UserID).
			Scan(&m.AvatarURL, &m.ArrivalStatus, &m.ArrivalUpdatedAt, &m.HasPreviousTicket); err != nil {
			return err
		}
	}
	for i := range p.Options {
		option := &p.Options[i]
		option.Reactions = []planReaction{}
		// Quote one currently available ticket including the buyer's service fee. No checkout or reservation is created.
		var base, total *float64
		if err := q.QueryRow(ctx, `SELECT COALESCE(e.banner_url,''),tt.price_ron::float8,
    (tt.bani+CASE WHEN tt.bani=0 OR e.organizer_absorbs_service_fee THEN 0 ELSE
      (tt.bani*COALESCE(c.rate_bps,s.rate_bps)+9999)/10000+COALESCE(c.per_ticket_bani,s.per_ticket_bani) END)::float8/100
    FROM events e CROSS JOIN platform_commission_settings s LEFT JOIN effective_organizer_commissions c ON c.organizer_id=e.organizer_id
    LEFT JOIN LATERAL (SELECT price_ron,round(price_ron*100)::bigint bani FROM ticket_types WHERE event_id=e.id AND capacity>tickets_sold AND end_sales>CURRENT_TIMESTAMP ORDER BY (start_sales<=CURRENT_TIMESTAMP) DESC,price_ron LIMIT 1) tt ON TRUE
    WHERE e.id=$1`, option.EventID).Scan(&option.ImageURL, &base, &total); err != nil {
			return err
		}
		option.PriceRon = base
		option.TotalPriceRon = total
		if total != nil {
			if err := q.QueryRow(ctx, `SELECT count(*) FROM outing_plan_members m JOIN users u ON u.id=m.user_id AND u.is_active WHERE plan_id=$1 AND status='accepted' AND budget_bani >= round($2::numeric*100)`, id, *total).Scan(&option.BudgetFits); err != nil {
				return err
			}
		}
		rows, err := q.Query(ctx, `SELECT a.user_id::text,a.answer FROM outing_plan_reactions a JOIN outing_plan_members m USING(plan_id,user_id) JOIN users u ON u.id=m.user_id AND u.is_active WHERE a.plan_id=$1 AND a.event_id=$2 AND m.status='accepted' ORDER BY a.user_id`, id, option.EventID)
		if err != nil {
			return err
		}
		for rows.Next() {
			var reaction planReaction
			if err = rows.Scan(&reaction.UserID, &reaction.Answer); err != nil {
				rows.Close()
				return err
			}
			option.Reactions = append(option.Reactions, reaction)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
	}
	rows, err := q.Query(ctx, `SELECT d.event_id::text,e.title,d.reopened_at FROM outing_plan_decisions d JOIN events e ON e.id=d.event_id WHERE d.plan_id=$1 AND d.reopened_at IS NOT NULL ORDER BY d.round DESC`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var prior previousPlanEvent
		if err = rows.Scan(&prior.EventID, &prior.Title, &prior.ChangedAt); err != nil {
			return err
		}
		p.PreviousEvents = append(p.PreviousEvents, prior)
	}
	return rows.Err()
}
