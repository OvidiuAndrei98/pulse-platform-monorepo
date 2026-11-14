package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http/httptest"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"testing"
)

func TestStandaloneGiftRequiresFriendshipAndKeepsNullPlanSnapshot(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	selection := &OutingRecipientsRequest{RecipientIDs: []string{common.UUIDToString(f.secondBuyerID)}}
	expected := int64(5400)
	run := context.WithValue(context.WithValue(ctx, expectedCheckoutTotalKey{}, &expected), outingPurchaseKey{}, selection)
	reserve := func() (pgtype.UUID, error) {
		o, _, _, _, _, _, e := h.reserveOrder(run, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Country: "RO"})
		return o.ID, e
	}
	if _, err := reserve(); err == nil || err.Error() != "OUTING_RECIPIENTS_CHANGED" {
		t.Fatalf("outsider gift: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted')`, f.buyerID, f.secondBuyerID); err != nil {
		t.Fatal(err)
	}
	order, err := reserve()
	if err != nil {
		t.Fatal(err)
	}
	var plan pgtype.UUID
	var round int
	var beneficiary pgtype.UUID
	if err = pool.QueryRow(ctx, `SELECT plan_id,decision_round,recipient_id FROM outing_ticket_recipients WHERE order_id=$1`, order).Scan(&plan, &round, &beneficiary); err != nil {
		t.Fatal(err)
	}
	if plan.Valid || round != 0 || beneficiary != f.secondBuyerID {
		t.Fatalf("standalone purchase invented group context: %v %d", plan, round)
	}
	selection.ExtraConfirmed = true
	if _, err = reserve(); err == nil || err.Error() != "OUTING_RECIPIENTS_CHANGED" {
		t.Fatalf("extra flag bypassed in-flight reservation: %v", err)
	}
}

func TestExtraTicketRequiresExplicitConfirmationWithoutBlockingLegitimateExtra(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	if _, _, err := h.bookFreeTicket(ctx, f.eventID, f.buyerID, f.buyerEmail, map[string]int32{common.UUIDToString(f.freeTicketID): 1}); err != nil {
		t.Fatal(err)
	}
	selection := &OutingRecipientsRequest{RecipientIDs: []string{common.UUIDToString(f.buyerID)}}
	expected := int64(5400)
	run := context.WithValue(context.WithValue(ctx, expectedCheckoutTotalKey{}, &expected), outingPurchaseKey{}, selection)
	reserve := func() error {
		_, _, _, _, _, _, err := h.reserveOrder(run, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Country: "RO"})
		return err
	}
	if err := reserve(); err == nil || err.Error() != "OUTING_RECIPIENTS_CHANGED" {
		t.Fatalf("extra not confirmed: %v", err)
	}
	selection.ExtraConfirmed = true
	if err := reserve(); err != nil {
		t.Fatalf("legitimate extra blocked: %v", err)
	}
}

func TestFreeGroupRegistrationIsIdempotentOfferedAndNeverInvoiced(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	if _, err := pool.Exec(ctx, `INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted')`, f.buyerID, f.secondBuyerID); err != nil {
		t.Fatal(err)
	}
	var key string
	if err := pool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&key); err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(BookFreeTicketRequest{Items: []CheckoutItemRequest{{TicketTypeID: common.UUIDToString(f.freeTicketID), Quantity: 2}}, Outing: &OutingRecipientsRequest{RecipientIDs: []string{common.UUIDToString(f.buyerID), common.UUIDToString(f.secondBuyerID)}}})
	api := chi.NewRouter()
	api.Post("/events/{id}/tickets/book", h.HandleBookFreeTicket)
	var first BookFreeTicketResponse
	for i := range 2 {
		r := httptest.NewRequest("POST", "/events/"+common.UUIDToString(f.eventID)+"/tickets/book", bytes.NewReader(payload))
		r.Header.Set("Idempotency-Key", key)
		r = r.WithContext(context.WithValue(r.Context(), auth.UserIDKey, common.UUIDToString(f.buyerID)))
		w := httptest.NewRecorder()
		api.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatalf("free recipients status=%d response=%s", w.Code, w.Body.String())
		}
		var response BookFreeTicketResponse
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			first = response
		} else if response.OrderID != first.OrderID || !response.AlreadyBooked {
			t.Fatalf("free retry duplicated registration: %+v %+v", first, response)
		}
	}
	var tickets, offers, attempts int
	var invoice bool
	var total int32
	var intent, session pgtype.Text
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets WHERE order_id=$1::uuid`, first.OrderID).Scan(&tickets); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM ticket_transfers x JOIN tickets t ON t.id=x.ticket_id WHERE t.order_id=$1::uuid AND x.status='pending' AND x.recipient_id=$2`, first.OrderID, f.secondBuyerID).Scan(&offers); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT invoice_requested,total_amount,stripe_payment_intent_id,stripe_checkout_session_id FROM orders WHERE id=$1::uuid`, first.OrderID).Scan(&invoice, &total, &intent, &session); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM checkout_payment_attempts WHERE order_id=$1::uuid`, first.OrderID).Scan(&attempts); err != nil {
		t.Fatal(err)
	}
	if tickets != 2 || offers != 1 || invoice || total != 0 || intent.Valid || session.Valid || attempts != 0 {
		t.Fatalf("unsafe free gift: tickets=%d offers=%d invoice=%v total=%d intent=%v session=%v attempts=%d", tickets, offers, invoice, total, intent.Valid, session.Valid, attempts)
	}
}
