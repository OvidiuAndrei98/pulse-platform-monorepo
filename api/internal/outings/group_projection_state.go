package outings

import (
	"context"
	"github.com/jackc/pgx/v5/pgtype"
	"time"
)

func loadGroupPlanBatched(ctx context.Context, q queryer, id, actor pgtype.UUID, p *plan) error {
	if p.GroupID == "" {
		return nil
	}
	group, err := uuid(p.GroupID)
	if err != nil {
		return err
	}
	event := pgtype.UUID{}
	if p.ChosenEventID != "" {
		event, err = uuid(p.ChosenEventID)
		if err != nil {
			return err
		}
	}
	p.Lifecycle = "choosing_date"
	if p.OutingDate != "" {
		p.Lifecycle = "choosing_event"
	}
	if event.Valid {
		p.Lifecycle = "event_selected"
	}
	if !p.ExpiresAt.After(time.Now()) {
		p.Lifecycle = "completed"
	}
	for _, option := range p.Options {
		if option.EventID == p.ChosenEventID && option.EventStatus == "cancelled" {
			p.Lifecycle = "cancelled"
		}
	}
	rows, err := q.Query(ctx, `SELECT m.user_id::text,COALESCE(a.answer,'unanswered'),admission.has_ticket,admission.used,
  EXISTS(SELECT 1 FROM ticket_transfers x JOIN tickets t ON t.id=x.ticket_id JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=o.event_id
   WHERE x.recipient_id=m.user_id AND o.event_id=$3 AND o.status='completed' AND o.stripe_refund_status='none' AND o.stripe_amount_refunded_bani=0 AND NOT o.stripe_refund_needs_attention
    AND NOT EXISTS(SELECT 1 FROM order_refund_operations rf WHERE rf.order_id=o.id) AND t.user_id=x.sender_id AND NOT t.is_validated AND NOT t.offline_credential_exposed AND e.status='published' AND e.start_time>CURRENT_TIMESTAMP AND x.status='pending' AND x.expires_at>CURRENT_TIMESTAMP),
  EXISTS(SELECT 1 FROM outing_ticket_recipients selected JOIN orders o ON o.id=selected.order_id JOIN checkout_payment_attempts attempt ON attempt.order_id=o.id WHERE selected.recipient_id=m.user_id AND selected.event_id=$3 AND o.status IN ('pending','failed') AND NOT EXISTS(SELECT 1 FROM checkout_closed_payments closed WHERE closed.order_id=o.id))
   OR EXISTS(SELECT 1 FROM orders o JOIN checkout_payment_attempts attempt ON attempt.order_id=o.id WHERE o.user_id=m.user_id AND o.event_id=$3 AND o.status IN ('pending','failed') AND NOT EXISTS(SELECT 1 FROM checkout_closed_payments closed WHERE closed.order_id=o.id)),
  EXISTS(SELECT 1 FROM ticket_types WHERE event_id=$3) AND EXISTS(SELECT 1 FROM events WHERE id=$3 AND external_ticket_url IS NULL)
 FROM outing_plan_members m JOIN friend_group_members gm ON gm.group_id=$4 AND gm.user_id=m.user_id AND gm.status='accepted'
 LEFT JOIN outing_attendance a ON a.plan_id=m.plan_id AND a.user_id=m.user_id AND a.decision_round=$2 AND a.responded_at>=gm.joined_at
 CROSS JOIN LATERAL(SELECT count(*)>0 AS has_ticket,COALESCE(bool_or(t.is_validated),FALSE) AS used
  FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.user_id=m.user_id AND o.event_id=$3 AND o.status='completed'
   AND o.stripe_refund_status='none' AND o.stripe_amount_refunded_bani=0 AND NOT o.stripe_refund_needs_attention
   AND NOT EXISTS(SELECT 1 FROM order_refund_operations rf WHERE rf.order_id=o.id)
   AND NOT EXISTS(SELECT 1 FROM ticket_transfers x JOIN events e ON e.id=o.event_id WHERE x.ticket_id=t.id AND x.sender_id=t.user_id AND NOT t.is_validated AND NOT t.offline_credential_exposed AND e.status='published' AND e.start_time>CURRENT_TIMESTAMP AND x.status='pending' AND x.expires_at>CURRENT_TIMESTAMP)) admission
 WHERE m.plan_id=$1 AND m.status='accepted'`, id, p.DecisionRound, event, group)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var uid, answer string
		var has, used, offered, processing, internal bool
		if err = rows.Scan(&uid, &answer, &has, &used, &offered, &processing, &internal); err != nil {
			return err
		}
		for i := range p.Members {
			m := &p.Members[i]
			if m.UserID != uid {
				continue
			}
			m.Attendance = answer
			m.TicketState = "unknown"
			if !event.Valid {
				continue
			}
			if internal || has || offered || processing {
				m.HasTicket = &has
			}
			if internal {
				m.TicketState = "none"
			}
			if processing {
				m.TicketState = "processing"
			}
			if offered {
				m.TicketState = "offered"
			}
			if has {
				m.TicketState = "valid"
			}
			if has && p.Lifecycle == "completed" {
				m.TicketState = "expired"
			}
			if has && used {
				m.TicketState = "used"
			}
			if answer == "yes" {
				p.ConfirmedCount++
				if has && p.Lifecycle == "event_selected" {
					p.ReadyCount++
				}
			}
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}
	p.AllConfirmedReady = p.ConfirmedCount > 0 && p.ReadyCount == p.ConfirmedCount && p.Lifecycle == "event_selected"
	return nil
}
