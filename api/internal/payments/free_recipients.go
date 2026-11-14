package payments

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
	"pulse-api/internal/router"
)

// Free registration has real inventory and individual credentials, but never a
// Stripe intent, invoice or charge. Its retry key uses the existing request log.
func (h *CheckoutHandler) handleFreeRecipients(w http.ResponseWriter, r *http.Request, event, buyer pgtype.UUID, email string, req BookFreeTicketRequest, requested map[string]int32, count int32) {
	var key pgtype.UUID
	if key.Scan(r.Header.Get("Idempotency-Key")) != nil || !key.Valid {
		router.RespondWithError(w, 400, "Idempotency-Key este obligatoriu pentru biletele oferite")
		return
	}
	payload, _ := json.Marshal(struct {
		Event   pgtype.UUID
		Request BookFreeTicketRequest
	}{event, req})
	requestID, claimed, err := h.claimCheckoutRequest(r.Context(), key, "free:user:"+common.UUIDToString(buyer), payload)
	if err != nil {
		router.RespondWithError(w, 409, "OUTING_RECIPIENTS_CHANGED")
		return
	}
	if !claimed {
		var order pgtype.UUID
		err = h.db.QueryRow(r.Context(), `SELECT cr.order_id FROM checkout_requests cr JOIN orders o ON o.id=cr.order_id WHERE cr.id=$1 AND o.status='completed' AND o.user_id=$2 AND o.event_id=$3 AND o.total_amount=0`, requestID, buyer, event).Scan(&order)
		if err == nil {
			router.RespondWithJSON(w, 200, BookFreeTicketResponse{OrderID: common.UUIDToString(order), AlreadyBooked: true})
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			w.Header().Set("Retry-After", "2")
			router.RespondWithError(w, 425, "Plata este in curs de pregatire sau verificare. Reincearca in cateva secunde.")
			return
		}
		router.RespondWithError(w, 503, "Cererea nu a putut fi verificata")
		return
	}
	defer h.releaseUnreservedRequest(requestID)
	ctx := context.WithValue(r.Context(), outingPurchaseKey{}, req.Outing)
	order, err := h.bookFreeRecipients(ctx, event, buyer, email, requested, count, requestID)
	if err != nil {
		var known *checkoutRequestError
		if errors.As(err, &known) {
			router.RespondWithError(w, known.status, known.message)
		} else {
			router.RespondWithError(w, 503, "Biletul gratuit nu a putut fi rezervat")
		}
		return
	}
	router.RespondWithJSON(w, 200, BookFreeTicketResponse{OrderID: common.UUIDToString(order)})
}

func (h *CheckoutHandler) bookFreeRecipients(ctx context.Context, event, buyer pgtype.UUID, email string, requested map[string]int32, count int32, requestID pgtype.UUID) (pgtype.UUID, error) {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return pgtype.UUID{}, err
	}
	defer tx.Rollback(ctx)
	if err = lockPurchaseGroup(ctx, tx, buyer); err != nil {
		return pgtype.UUID{}, err
	}
	q := h.queries.WithTx(tx)
	if _, err = q.LockPublishedEventForCheckout(ctx, event); err != nil {
		return pgtype.UUID{}, recipientConflict()
	}
	e, err := q.GetEventForCheckout(ctx, event)
	if err != nil {
		return pgtype.UUID{}, err
	}
	if e.OrganizerID == buyer || e.ExternalTicketUrl.Valid {
		return pgtype.UUID{}, recipientConflict()
	}
	recipients, err := lockCheckoutRecipients(ctx, tx, event, buyer, count)
	if err != nil {
		return pgtype.UUID{}, err
	}
	if len(recipients) == 0 || len(requested) != 1 {
		return pgtype.UUID{}, recipientConflict()
	}
	var tier pgtype.UUID
	for raw := range requested {
		if tier.Scan(raw) != nil || !tier.Valid {
			return pgtype.UUID{}, recipientConflict()
		}
	}
	ticket, err := q.GetTicketTypeForUpdate(ctx, tier)
	if err != nil {
		return pgtype.UUID{}, err
	}
	var onSale bool
	if err = tx.QueryRow(ctx, `SELECT start_sales<=CURRENT_TIMESTAMP AND end_sales>CURRENT_TIMESTAMP FROM ticket_types WHERE id=$1`, tier).Scan(&onSale); err != nil {
		return pgtype.UUID{}, err
	}
	if ticket.EventID != event || ticket.PriceRon != 0 || !onSale || ticket.Capacity-ticket.TicketsSold < count {
		return pgtype.UUID{}, recipientConflict()
	}
	order, err := q.CreateFreeBookingOrder(ctx, db.CreateFreeBookingOrderParams{UserID: buyer, EventID: event, Email: email})
	if err != nil {
		return pgtype.UUID{}, err
	}
	if err = q.IncrementTicketsSold(ctx, db.IncrementTicketsSoldParams{ID: tier, TicketsSold: count}); err != nil {
		return pgtype.UUID{}, err
	}
	if err = q.CreateOrderItem(ctx, db.CreateOrderItemParams{OrderID: order.ID, TicketTypeID: tier, Quantity: count, UnitPriceRon: 0}); err != nil {
		return pgtype.UUID{}, err
	}
	if err = saveCheckoutRecipients(ctx, tx, order.ID, event, recipients); err != nil {
		return pgtype.UUID{}, err
	}
	for ordinal := range recipients {
		hash, e := generateValidationHash()
		if e != nil {
			return pgtype.UUID{}, e
		}
		t, e := q.CreateTicket(ctx, db.CreateTicketParams{OrderID: order.ID, TicketTypeID: tier, UserID: buyer, ValidationHash: hash})
		if e != nil {
			return pgtype.UUID{}, e
		}
		if e = bindCheckoutRecipient(ctx, tx, order.ID, t.ID, buyer, ordinal); e != nil {
			return pgtype.UUID{}, e
		}
	}
	if err = q.CreateTicketPurchaseNotification(ctx, order.ID); err != nil {
		return pgtype.UUID{}, err
	}
	result, err := tx.Exec(ctx, `UPDATE checkout_requests SET order_id=$2 WHERE id=$1 AND order_id IS NULL`, requestID, order.ID)
	if err != nil {
		return pgtype.UUID{}, err
	}
	if result.RowsAffected() != 1 {
		return pgtype.UUID{}, recipientConflict()
	}
	if err = tx.Commit(ctx); err != nil {
		return pgtype.UUID{}, err
	}
	return order.ID, nil
}
