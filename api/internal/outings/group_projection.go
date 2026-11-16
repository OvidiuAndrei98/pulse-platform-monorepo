package outings

import (
	"context"
	"github.com/jackc/pgx/v5/pgtype"
)

// Permanent-group snapshots use batch projections. Query count does not grow
// with the eight members or eight proposals, and no QR/order rows are returned.
func loadPermanentPlanDetails(ctx context.Context, q queryer, id, actor pgtype.UUID, p *plan) error {
	if p.ChosenEventID != "" {
		var gifts bool
		var paymentID pgtype.UUID
		var session *string
		var attempted bool
		err := q.QueryRow(ctx, `SELECT e.status='published' AND e.start_time>CURRENT_TIMESTAMP AND NOT e.ticket_transfers_locked AND e.external_ticket_url IS NULL,
   payment.id,payment.stripe_checkout_session_id,COALESCE(payment.attempted,FALSE) FROM events e LEFT JOIN LATERAL(
    SELECT o.id,o.stripe_checkout_session_id,EXISTS(SELECT 1 FROM checkout_payment_attempts attempt WHERE attempt.order_id=o.id) attempted FROM orders o
    WHERE o.user_id=$2 AND o.event_id=e.id AND o.status IN ('pending','failed') AND NOT EXISTS(SELECT 1 FROM checkout_closed_payments c WHERE c.order_id=o.id)
    AND (o.status='pending' OR o.stripe_payment_intent_id IS NOT NULL OR o.stripe_checkout_session_id IS NOT NULL)
    ORDER BY o.created_at DESC LIMIT 1) payment ON TRUE WHERE e.id=$1::uuid`, p.ChosenEventID, actor).Scan(&gifts, &paymentID, &session, &attempted)
		if err != nil {
			return err
		}
		p.GiftPurchasesAvailable = &gifts
		if paymentID.Valid {
			payment := &pendingPlanPayment{OrderID: sid(paymentID)}
			if session != nil {
				payment.SessionID = *session
			}
			if attempted {
				p.MyPendingPayment = payment
			} else {
				p.MyCheckoutReservation = payment
			}
		}
	}
	rows, err := q.Query(ctx, `SELECT m.user_id::text,COALESCE(u.avatar_url,''),
  m.user_id=$2 AND EXISTS(SELECT 1 FROM outing_plan_decisions d JOIN orders o ON o.event_id=d.event_id JOIN tickets t ON t.order_id=o.id
   WHERE d.plan_id=m.plan_id AND d.reopened_at IS NOT NULL AND t.user_id=m.user_id AND o.status='completed'
    AND o.stripe_refund_status='none' AND o.stripe_amount_refunded_bani=0 AND NOT o.stripe_refund_needs_attention)
  FROM outing_plan_members m JOIN users u ON u.id=m.user_id WHERE m.plan_id=$1`, id, actor)
	if err != nil {
		return err
	}
	for rows.Next() {
		var uid, avatar string
		var previous bool
		if err = rows.Scan(&uid, &avatar, &previous); err != nil {
			break
		}
		for i := range p.Members {
			if p.Members[i].UserID == uid {
				p.Members[i].AvatarURL = avatar
				p.Members[i].HasPreviousTicket = previous
			}
		}
	}
	rows.Close()
	if err != nil {
		return err
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	rows, err = q.Query(ctx, `SELECT e.id::text,COALESCE(e.banner_url,''),tt.price_ron::float8,
  (tt.bani+CASE WHEN tt.bani=0 OR e.organizer_absorbs_service_fee THEN 0 ELSE
    (tt.bani*COALESCE(c.rate_bps,s.rate_bps)+9999)/10000+COALESCE(c.per_ticket_bani,s.per_ticket_bani) END)::float8/100
  FROM outing_plan_options option JOIN events e ON e.id=option.event_id CROSS JOIN platform_commission_settings s
  LEFT JOIN effective_organizer_commissions c ON c.organizer_id=e.organizer_id
  LEFT JOIN LATERAL(SELECT price_ron,round(price_ron*100)::bigint bani FROM ticket_types WHERE event_id=e.id AND capacity>tickets_sold AND end_sales>CURRENT_TIMESTAMP ORDER BY (start_sales<=CURRENT_TIMESTAMP) DESC,price_ron LIMIT 1) tt ON TRUE
  WHERE option.plan_id=$1`, id)
	if err != nil {
		return err
	}
	for rows.Next() {
		var event, uri string
		var base, total *float64
		if err = rows.Scan(&event, &uri, &base, &total); err != nil {
			break
		}
		for i := range p.Options {
			if p.Options[i].EventID == event {
				p.Options[i].ImageURL = uri
				p.Options[i].PriceRon = base
				p.Options[i].TotalPriceRon = total
				p.Options[i].Reactions = []planReaction{}
			}
		}
	}
	rows.Close()
	if err != nil {
		return err
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	rows, err = q.Query(ctx, `SELECT a.event_id::text,a.user_id::text,a.answer FROM outing_plan_reactions a JOIN outing_plan_members m USING(plan_id,user_id) JOIN users u ON u.id=m.user_id AND u.is_active WHERE a.plan_id=$1 AND m.status='accepted' ORDER BY a.user_id`, id)
	if err != nil {
		return err
	}
	for rows.Next() {
		var event string
		var reaction planReaction
		if err = rows.Scan(&event, &reaction.UserID, &reaction.Answer); err != nil {
			break
		}
		for i := range p.Options {
			if p.Options[i].EventID == event {
				p.Options[i].Reactions = append(p.Options[i].Reactions, reaction)
			}
		}
	}
	rows.Close()
	if err != nil {
		return err
	}
	if rows.Err() != nil {
		return rows.Err()
	}
	rows, err = q.Query(ctx, `SELECT d.event_id::text,e.title,d.reopened_at FROM outing_plan_decisions d JOIN events e ON e.id=d.event_id WHERE d.plan_id=$1 AND d.reopened_at IS NOT NULL ORDER BY d.round DESC`, id)
	if err != nil {
		return err
	}
	for rows.Next() {
		var prior previousPlanEvent
		if err = rows.Scan(&prior.EventID, &prior.Title, &prior.ChangedAt); err != nil {
			break
		}
		p.PreviousEvents = append(p.PreviousEvents, prior)
	}
	rows.Close()
	if err != nil {
		return err
	}
	return rows.Err()
}
