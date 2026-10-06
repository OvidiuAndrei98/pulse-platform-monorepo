package payments

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http/httptest"
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
	"sync"
	"testing"
)

func TestCheckoutRequestDeduplicatesConcurrentRetriesAndBindsInventory(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	h := &CheckoutHandler{queries: db.New(pool), db: pool}
	ctx := context.Background()
	var key pgtype.UUID
	if err := pool.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&key); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	claims := 0
	var requestID pgtype.UUID
	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id, claimed, err := h.claimCheckoutRequest(ctx, key, f.buyerEmail, []byte("same purchase"))
			if err != nil {
				t.Error(err)
				return
			}
			if claimed {
				mu.Lock()
				claims++
				requestID = id
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if claims != 1 {
		t.Fatalf("%d reservations allowed for one intent", claims)
	}
	requestCtx := context.WithValue(ctx, checkoutRequestContextKey{}, requestID)
	order, _, _, _, _, _, err := h.reserveOrder(requestCtx, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Name: "Test", Address: "Test", City: "Test", County: "Test", Country: "RO"})
	if err != nil {
		t.Fatal(err)
	}
	h.releaseUnreservedRequest(requestID)
	var bound pgtype.UUID
	if err := pool.QueryRow(ctx, "SELECT order_id FROM checkout_requests WHERE id=$1", requestID).Scan(&bound); err != nil || bound != order.ID {
		t.Fatalf("inventory not bound atomically: %v", err)
	}
	_, claimed, err := h.claimCheckoutRequest(ctx, key, f.buyerEmail, []byte("same purchase"))
	if err != nil || claimed {
		t.Fatal("retry creates a second order", err)
	}
	_, _, err = h.claimCheckoutRequest(ctx, key, f.buyerEmail, []byte("changed purchase"))
	var conflict *checkoutRequestError
	if !errors.As(err, &conflict) || conflict.status != 409 {
		t.Fatal("different payload silently reused", err)
	}
	h.persistCheckoutResponse(requestID, CreateCheckoutResponse{CheckoutURL: "https://example.invalid/checkout", OrderID: common.UUIDToString(order.ID)})
	w := httptest.NewRecorder()
	h.replayCheckoutRequest(w, httptest.NewRequest("POST", "/checkout", nil), requestID)
	if w.Code != 201 {
		t.Fatalf("lost response not recovered: %d %s", w.Code, w.Body.String())
	}
	otherID, claimed, err := h.claimCheckoutRequest(ctx, key, f.secondBuyerEmail, []byte("same purchase"))
	if err != nil || !claimed || otherID == requestID {
		t.Fatal("cross-user replay", err)
	}
	h.releaseUnreservedRequest(otherID)
}

func TestAbandonedUnreservedCheckoutCanBeRetriedWithoutOldOwnerInterference(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	h := &CheckoutHandler{queries: db.New(pool), db: pool}
	ctx := context.Background()
	var key pgtype.UUID
	_ = pool.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&key)
	old, claimed, err := h.claimCheckoutRequest(ctx, key, "abandoned", []byte("payload"))
	if err != nil || !claimed {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE checkout_requests SET created_at=now()-interval '3 minutes' WHERE id=$1", old); err != nil {
		t.Fatal(err)
	}
	current, claimed, err := h.claimCheckoutRequest(ctx, key, "abandoned", []byte("payload"))
	if err != nil || !claimed || old == current {
		t.Fatal("abandoned request stayed blocked", err)
	}
	h.releaseUnreservedRequest(old)
	_, claimed, err = h.claimCheckoutRequest(ctx, key, "abandoned", []byte("payload"))
	if err != nil || claimed {
		t.Fatal("old request deleted new owner", err)
	}
	h.releaseUnreservedRequest(current)
}
