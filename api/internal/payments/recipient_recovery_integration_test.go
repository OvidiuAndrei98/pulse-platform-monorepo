package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
)

func TestRecipientRecoveryNeverLeaksAnotherBuyersPendingOrder(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	if _, err := pool.Exec(ctx, `INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted')`, f.buyerID, f.secondBuyerID); err != nil {
		t.Fatal(err)
	}
	expected := int64(5400)
	selected := &OutingRecipientsRequest{RecipientIDs: []string{common.UUIDToString(f.secondBuyerID)}}
	run := context.WithValue(context.WithValue(ctx, expectedCheckoutTotalKey{}, &expected), outingPurchaseKey{}, selected)
	order, _, _, _, _, _, err := h.reserveOrder(run, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Country: "RO"})
	if err != nil {
		t.Fatal(err)
	}
	api := chi.NewRouter()
	api.Post("/events/{id}/tickets/book", h.HandleBookFreeTicket)
	for _, actor := range []pgtype.UUID{f.buyerID, f.secondBuyerID} {
		for _, extra := range []bool{false, true} {
			payload, _ := json.Marshal(BookFreeTicketRequest{Items: []CheckoutItemRequest{{TicketTypeID: common.UUIDToString(f.freeTicketID), Quantity: 1}}, Outing: &OutingRecipientsRequest{RecipientIDs: selected.RecipientIDs, ExtraConfirmed: extra}})
			req := httptest.NewRequest("POST", "/events/"+common.UUIDToString(f.eventID)+"/tickets/book", bytes.NewReader(payload))
			var key string
			if err = pool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&key); err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Idempotency-Key", key)
			req = req.WithContext(context.WithValue(req.Context(), auth.UserIDKey, common.UUIDToString(actor)))
			w := httptest.NewRecorder()
			api.ServeHTTP(w, req)
			if w.Code != 409 {
				t.Fatalf("pending access status=%d body=%s", w.Code, w.Body.String())
			}
			var body map[string]string
			if err = json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body["error"] != "OUTING_RECIPIENTS_CHANGED" {
				t.Fatal("legacy conflict code changed")
			}
			if actor == f.buyerID {
				if body["reason"] != "existing_payment" || body["orderId"] != common.UUIDToString(order.ID) {
					t.Fatalf("buyer cannot recover own payment: %+v", body)
				}
			} else if body["reason"] != "pending_access" || body["orderId"] != "" {
				t.Fatalf("recipient learned another buyer's order: %+v", body)
			}
		}
	}
	var orders, tickets int
	if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM orders WHERE event_id=$1),(SELECT count(*) FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.event_id=$1)`, f.eventID).Scan(&orders, &tickets); err != nil {
		t.Fatal(err)
	}
	if orders != 1 || tickets != 0 {
		t.Fatalf("conflict created a purchase or admission: orders=%d tickets=%d", orders, tickets)
	}
}

func TestRecipientRecoveryClosedOrHarmlessFailedPaymentsAreNotRecoverable(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	expected := int64(5400)
	order, _, _, _, _, _, err := h.reserveOrder(context.WithValue(ctx, expectedCheckoutTotalKey{}, &expected), f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Country: "RO"})
	if err != nil {
		t.Fatal(err)
	}
	assertPendingOnly := func() {
		t.Helper()
		e := pendingRecipientConflict(ctx, pool, f.eventID, f.buyerID, common.UUIDToString(f.buyerID))
		w := httptest.NewRecorder()
		if !respondCheckoutRequestError(w, e) {
			t.Fatal(e)
		}
		var body map[string]string
		if err = json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if body["reason"] != "pending_access" || body["orderId"] != "" {
			t.Fatalf("closed/never-submitted failure exposed for recovery: %+v", body)
		}
	}
	if _, err = pool.Exec(ctx, `UPDATE orders SET status='failed',stripe_payment_intent_id=NULL,stripe_checkout_session_id=NULL WHERE id=$1`, order.ID); err != nil {
		t.Fatal(err)
	}
	assertPendingOnly()
	if _, err = pool.Exec(ctx, `UPDATE orders SET status='pending' WHERE id=$1`, order.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO checkout_closed_payments(order_id) VALUES($1)`, order.ID); err != nil {
		t.Fatal(err)
	}
	assertPendingOnly()
}

func TestFreeRecipientStorageFailureIsNotAMisleadingSelectionConflict(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	r := httptest.NewRequest("POST", "/events/"+common.UUIDToString(f.eventID)+"/tickets/book", nil).WithContext(ctx)
	r.Header.Set("Idempotency-Key", "81111111-2222-4333-8444-555555555555")
	w := httptest.NewRecorder()
	h.handleFreeRecipients(w, r, f.eventID, f.buyerID, f.buyerEmail, BookFreeTicketRequest{Outing: &OutingRecipientsRequest{RecipientIDs: []string{common.UUIDToString(f.buyerID)}}}, map[string]int32{common.UUIDToString(f.freeTicketID): 1}, 1)
	if w.Code != 503 {
		t.Fatalf("unavailable storage misreported as changed recipients: %d %s", w.Code, w.Body.String())
	}
}
