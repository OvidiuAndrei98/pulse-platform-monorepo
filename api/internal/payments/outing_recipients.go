package payments

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	"pulse-api/internal/common"
	"pulse-api/internal/router"
	"sort"
)

// This is a snapshot of an explicit checkout choice, never a group payment pot.
type OutingRecipientsRequest struct {
	PlanID         string   `json:"planId,omitempty"`
	DecisionRound  int      `json:"decisionRound"`
	RecipientIDs   []string `json:"recipientIds"`
	ExtraConfirmed bool     `json:"extraConfirmed,omitempty"`
}
type outingPurchaseKey struct{}

type checkoutSelectionError struct {
	cause   *checkoutRequestError
	reason  string
	orderID string
}

func (e *checkoutSelectionError) Error() string { return e.cause.Error() }
func (e *checkoutSelectionError) Unwrap() error { return e.cause }

func recipientConflict(reason ...string) error {
	cause := &checkoutRequestError{http.StatusConflict, "OUTING_RECIPIENTS_CHANGED"}
	if len(reason) == 0 {
		return cause
	}
	return &checkoutSelectionError{cause: cause, reason: reason[0]}
}

// Keep the existing public error code for older clients. The bounded reason
// distinguishes recovery actions without exposing another member's order.
func respondCheckoutRequestError(w http.ResponseWriter, err error) bool {
	var known *checkoutRequestError
	if !errors.As(err, &known) {
		return false
	}
	if known.status == http.StatusTooManyRequests {
		w.Header().Set("Retry-After", "300")
	}
	var selection *checkoutSelectionError
	if errors.As(err, &selection) {
		payload := map[string]string{"error": known.message, "reason": selection.reason}
		if selection.orderID != "" {
			payload["orderId"] = selection.orderID
		}
		router.RespondWithJSON(w, known.status, payload)
	} else {
		router.RespondWithError(w, known.status, known.message)
	}
	return true
}

func pendingRecipientConflict(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, event, buyer pgtype.UUID, recipient string) error {
	err := recipientConflict("pending_access").(*checkoutSelectionError)
	// Only the purchaser can receive an order reference. A friend learns only
	// that admission is pending, never the buyer's identity or payment details.
	var order string
	queryErr := q.QueryRow(ctx, `SELECT o.id::text FROM orders o WHERE o.user_id=$1 AND o.event_id=$2
 AND o.status IN ('pending','failed') AND NOT EXISTS(SELECT 1 FROM checkout_closed_payments c WHERE c.order_id=o.id)
 AND (o.user_id=$3::uuid AND (o.status='pending' OR o.stripe_payment_intent_id IS NOT NULL OR o.stripe_checkout_session_id IS NOT NULL)
      OR EXISTS(SELECT 1 FROM outing_ticket_recipients a WHERE a.order_id=o.id AND a.recipient_id=$3::uuid))
 ORDER BY o.created_at DESC LIMIT 1`, buyer, event, recipient).Scan(&order)
	if queryErr != nil && !errors.Is(queryErr, pgx.ErrNoRows) {
		return queryErr
	}
	if order != "" {
		err.reason = "existing_payment"
		err.orderID = order
	}
	return err
}

// Group mutations acquire the same parent lock before touching outings. Take
// it before inventory/event locks so leaving or changing a destination cannot
// race a purchase snapshot, and so event->group / group->event cannot deadlock.
func lockPurchaseGroup(ctx context.Context, tx pgx.Tx, buyer pgtype.UUID) error {
	selection, _ := ctx.Value(outingPurchaseKey{}).(*OutingRecipientsRequest)
	if selection == nil || selection.PlanID == "" {
		return nil
	}
	var planID pgtype.UUID
	if planID.Scan(selection.PlanID) != nil || !planID.Valid || !buyer.Valid {
		return recipientConflict()
	}
	var groupID pgtype.UUID
	err := tx.QueryRow(ctx, `SELECT g.id FROM outing_plans p JOIN friend_groups g ON g.id=p.group_id
 JOIN friend_group_members m ON m.group_id=g.id AND m.user_id=$2 AND m.status='accepted'
 WHERE p.id=$1 FOR SHARE OF g,m`, planID, buyer).Scan(&groupID)
	if err == pgx.ErrNoRows {
		return recipientConflict("review_recipients")
	}
	return err
}

// Event is locked by the caller before these locks. Normal self purchases take
// the same per-event account locks, closing the self-versus-gift race without
// globally prohibiting legitimate multi-ticket purchases.
func lockCheckoutRecipients(ctx context.Context, tx pgx.Tx, event, buyer pgtype.UUID, count int32) ([]string, error) {
	selection, _ := ctx.Value(outingPurchaseKey{}).(*OutingRecipientsRequest)
	ids := []string{}
	if selection != nil {
		if !buyer.Valid || len(selection.RecipientIDs) < 1 || len(selection.RecipientIDs) > 8 || int32(len(selection.RecipientIDs)) != count {
			return nil, recipientConflict()
		}
		var activeBuyer bool
		if err := tx.QueryRow(ctx, `SELECT is_active FROM users WHERE id=$1`, buyer).Scan(&activeBuyer); err != nil {
			if err == pgx.ErrNoRows {
				return nil, recipientConflict()
			}
			return nil, err
		}
		if !activeBuyer {
			return nil, recipientConflict()
		}
		seen := map[string]bool{}
		for _, raw := range selection.RecipientIDs {
			var id pgtype.UUID
			if id.Scan(raw) != nil || !id.Valid || id.Bytes == [16]byte{} {
				return nil, recipientConflict()
			}
			s := common.UUIDToString(id)
			if seen[s] {
				return nil, recipientConflict()
			}
			seen[s] = true
			ids = append(ids, s)
		}
		if selection.PlanID != "" {
			var planID pgtype.UUID
			if planID.Scan(selection.PlanID) != nil || !planID.Valid || planID.Bytes == [16]byte{} || selection.DecisionRound < 1 {
				return nil, recipientConflict()
			}
			var valid bool
			// FOR SHARE prevents reopening the destination while its purchase snapshot
			// is committed. Later fulfillment always uses the saved event/round.
			err := tx.QueryRow(ctx, `SELECT p.chosen_event_id=$2 AND p.decision_round=$3 AND p.expires_at>CURRENT_TIMESTAMP
    FROM outing_plans p JOIN outing_plan_members m ON m.plan_id=p.id AND m.user_id=$4 AND m.status='accepted'
    JOIN friend_group_members membership ON membership.group_id=p.group_id AND membership.user_id=$4 AND membership.status='accepted'
    JOIN users buyer ON buyer.id=m.user_id AND buyer.is_active
    WHERE p.id=$1::uuid FOR SHARE OF p`, selection.PlanID, event, selection.DecisionRound, buyer).Scan(&valid)
			if err == pgx.ErrNoRows || err == nil && !valid {
				return nil, recipientConflict("outing_changed")
			}
			if err != nil {
				return nil, err
			}
		} else if selection.DecisionRound != 0 {
			return nil, recipientConflict()
		}
	}
	locks := append([]string{}, ids...)
	if buyer.Valid {
		locks = append(locks, common.UUIDToString(buyer))
	}
	sort.Strings(locks)
	previous := ""
	for _, id := range locks {
		if id == previous {
			continue
		}
		previous = id
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "outing-admission:"+common.UUIDToString(event)+":"+id); err != nil {
			return nil, err
		}
	}
	if selection == nil {
		if !buyer.Valid {
			return ids, nil
		}
		var held bool
		err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM outing_ticket_recipients a JOIN orders o ON o.id=a.order_id
   LEFT JOIN tickets assigned_ticket ON assigned_ticket.id=a.ticket_id LEFT JOIN ticket_transfers x ON x.ticket_id=a.ticket_id WHERE a.event_id=$1 AND a.recipient_id=$2
   AND (o.status IN ('pending','failed') AND NOT EXISTS(SELECT 1 FROM checkout_closed_payments c WHERE c.order_id=o.id)
     OR o.status='completed' AND NOT assigned_ticket.offline_credential_exposed AND x.status='pending' AND x.expires_at>CURRENT_TIMESTAMP))`, event, buyer).Scan(&held)
		if err != nil {
			return nil, err
		}
		if held {
			return nil, pendingRecipientConflict(ctx, tx, event, buyer, common.UUIDToString(buyer))
		}
		return ids, nil
	}
	for _, id := range ids {
		var memberAllowed, hasAdmission, pendingOrder, pendingAssignment bool
		err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=$2::uuid AND u.is_active AND (
    CASE WHEN NULLIF($1::text,'') IS NOT NULL THEN EXISTS(SELECT 1 FROM outing_plans p
      JOIN outing_plan_members pm ON pm.plan_id=p.id AND pm.user_id=u.id AND pm.status='accepted'
      JOIN friend_group_members gm ON gm.group_id=p.group_id AND gm.user_id=u.id AND gm.status='accepted'
      WHERE p.id=NULLIF($1::text,'')::uuid)
    ELSE u.id=$4::uuid OR EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND
      ((f.user_id=$4::uuid AND f.friend_id=u.id) OR (f.friend_id=$4::uuid AND f.user_id=u.id))) END)),
   EXISTS(SELECT 1 FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.user_id=$2::uuid AND o.event_id=$3 AND o.status='completed'
     AND o.stripe_refund_status='none' AND o.stripe_amount_refunded_bani=0
     AND NOT o.stripe_refund_needs_attention AND NOT EXISTS(SELECT 1 FROM order_refund_operations rf WHERE rf.order_id=o.id)
     AND NOT EXISTS(SELECT 1 FROM outing_ticket_recipients other JOIN ticket_transfers transfer ON transfer.ticket_id=other.ticket_id
       WHERE other.ticket_id=t.id AND other.recipient_id<>t.user_id AND NOT t.offline_credential_exposed AND transfer.status='pending' AND transfer.expires_at>CURRENT_TIMESTAMP)),
   EXISTS(SELECT 1 FROM orders o WHERE o.user_id=$2::uuid AND o.event_id=$3 AND
     o.status IN ('pending','failed') AND NOT EXISTS(SELECT 1 FROM checkout_closed_payments c WHERE c.order_id=o.id)
     AND (o.status='pending' OR o.stripe_payment_intent_id IS NOT NULL OR o.stripe_checkout_session_id IS NOT NULL)),
   EXISTS(SELECT 1 FROM outing_ticket_recipients a JOIN orders o ON o.id=a.order_id LEFT JOIN tickets assigned_ticket ON assigned_ticket.id=a.ticket_id LEFT JOIN ticket_transfers x ON x.ticket_id=a.ticket_id
     WHERE a.recipient_id=$2::uuid AND a.event_id=$3 AND
       (o.status IN ('pending','failed') AND NOT EXISTS(SELECT 1 FROM checkout_closed_payments c WHERE c.order_id=o.id)
         OR o.status='completed' AND NOT assigned_ticket.offline_credential_exposed AND x.status='pending' AND x.expires_at>CURRENT_TIMESTAMP))`, selection.PlanID, id, event, buyer).Scan(&memberAllowed, &hasAdmission, &pendingOrder, &pendingAssignment)
		if err != nil {
			return nil, err
		}
		if !memberAllowed {
			return nil, recipientConflict("review_recipients")
		}
		if pendingOrder || pendingAssignment {
			return nil, pendingRecipientConflict(ctx, tx, event, buyer, id)
		}
		if hasAdmission && !selection.ExtraConfirmed {
			return nil, recipientConflict("additional_ticket_confirmation")
		}
	}
	// Gifts must remain transferable. An offline scanner pack freezes credentials.
	var transferable bool
	err := tx.QueryRow(ctx, `SELECT NOT ticket_transfers_locked AND start_time>CURRENT_TIMESTAMP FROM events WHERE id=$1`, event).Scan(&transferable)
	gifts := false
	for _, id := range ids {
		if id != common.UUIDToString(buyer) {
			gifts = true
		}
	}
	if err != nil {
		return nil, err
	}
	if gifts && !transferable {
		return nil, &checkoutRequestError{http.StatusConflict, "TICKET_GIFT_WINDOW_CLOSED"}
	}
	return ids, nil
}

func saveCheckoutRecipients(ctx context.Context, tx pgx.Tx, order, event pgtype.UUID, ids []string) error {
	selection, _ := ctx.Value(outingPurchaseKey{}).(*OutingRecipientsRequest)
	if selection == nil {
		return nil
	}
	for i, id := range ids {
		if _, err := tx.Exec(ctx, `INSERT INTO outing_ticket_recipients(order_id,ordinal,plan_id,decision_round,event_id,recipient_id,recipient_name)
	   SELECT $1,$2,NULLIF($3::text,'')::uuid,$4,$5,u.id,u.username FROM users u WHERE u.id=$6::uuid`, order, i, selection.PlanID, selection.DecisionRound, event, id); err != nil {
			return err
		}
	}
	return nil
}

// Called under the existing paid-order row lock, inside ticket issuance. Retry
// webhooks cannot duplicate tickets, offers or the existing notification outbox.
func bindCheckoutRecipient(ctx context.Context, tx pgx.Tx, order, ticket, buyer pgtype.UUID, ordinal int) error {
	var recipient pgtype.UUID
	err := tx.QueryRow(ctx, `UPDATE outing_ticket_recipients SET ticket_id=$3 WHERE order_id=$1 AND ordinal=$2 RETURNING recipient_id`, order, ordinal, ticket).Scan(&recipient)
	if err == pgx.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	if !recipient.Valid || recipient == buyer {
		return nil
	}
	_, err = tx.Exec(ctx, `INSERT INTO ticket_transfers(ticket_id,sender_id,recipient_id,recipient_email,request_id,expires_at)
   SELECT $1,$2,u.id,lower(u.email),gen_random_uuid(),e.start_time FROM users u,orders o JOIN events e ON e.id=o.event_id
   WHERE u.id=$3 AND o.id=$4`, ticket, buyer, recipient, order)
	return err
}

func closeCheckoutPayment(ctx context.Context, tx pgx.Tx, order pgtype.UUID) error {
	_, err := tx.Exec(ctx, `INSERT INTO checkout_closed_payments(order_id) VALUES($1) ON CONFLICT DO NOTHING`, order)
	return err
}
