package payments

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

func TestPaidHostedCheckoutReviewNeverAllowsAnotherCharge(t *testing.T) {
	for _, scenario := range []struct {
		name, status string
		sold         int32
		closeEvent   bool
	}{
		{"closed event", "pending", 2, true},
		{"released inventory resold", "failed", 10, false},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			pool := paymentSecurityTestPool(t)
			f := seedCheckoutRetryFixture(t, pool, scenario.status, scenario.sold, 10)
			ctx := context.Background()
			h := &CheckoutHandler{queries: db.New(pool), db: pool, configured: true, expectedLiveModeKnown: true, expectedLiveMode: true}
			if scenario.closeEvent {
				if _, err := pool.Exec(ctx, `UPDATE events SET status='completed' WHERE id=$1`, f.eventID); err != nil {
					t.Fatal(err)
				}
			}
			session := stripe.CheckoutSession{
				ID: f.sessionID, Status: stripe.CheckoutSessionStatusComplete,
				PaymentStatus: stripe.CheckoutSessionPaymentStatusPaid, Livemode: true,
				PaymentIntent: &stripe.PaymentIntent{ID: f.paymentID},
				Metadata:      map[string]string{"spottr_order_id": common.UUIDToString(f.orderID)},
			}
			useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet || r.Header.Get("Stripe-Account") != f.accountID {
					t.Error("payment review must retrieve the existing session in its connected account")
				}
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(session)
			})
			// Both initial reconciliation and later app/browser recovery must stay
			// unresolved. A failed response would permit paying for a second order.
			for range 2 {
				status, orderID, err := h.reconcileCheckoutSession(ctx, f.sessionID, common.UUIDToString(f.eventID))
				if err != nil || status != "pending" || orderID != common.UUIDToString(f.orderID) {
					t.Fatalf("paid review response: status=%s order=%s err=%v", status, orderID, err)
				}
				assertCheckoutRetryState(t, pool, f, scenario.status, scenario.sold, 0, true)
			}
		})
	}
}

func TestPaidNativeCheckoutReviewOfReleasedInventoryNeverAllowsAnotherCharge(t *testing.T) {
	pool, h, f, order, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE orders SET status='failed' WHERE id=$1`, f.orderID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE ticket_types SET tickets_sold=capacity WHERE id=$1`, f.ticketType); err != nil {
		t.Fatal(err)
	}
	order.Status = db.OrderStatusFailed
	for _, cancelPayment := range []bool{false, true} {
		status, err := h.reconcileNativePaymentIntent(ctx, order, &intent, time.Now().Add(-time.Minute), cancelPayment)
		if err != nil || status != "pending" {
			t.Fatalf("paid review response: cancel=%t status=%s err=%v", cancelPayment, status, err)
		}
		assertCheckoutRetryState(t, pool, f, "failed", 10, 0, true)
	}
	// A client that lost the initial purchase response has no secure recovery
	// entry yet. Replaying its request must preserve the idempotency key too.
	var key pgtype.UUID
	if err := pool.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&key); err != nil {
		t.Fatal(err)
	}
	requestID, _, err := h.claimCheckoutRequest(ctx, key, "native-review:"+common.UUIDToString(f.orderID), []byte(`{"test":"paid review"}`))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM checkout_requests WHERE id=$1`, requestID) })
	if _, err := pool.Exec(ctx, `UPDATE checkout_requests SET order_id=$2 WHERE id=$1`, requestID, f.orderID); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	h.replayNativePaymentSheet(w, httptest.NewRequest(http.MethodPost, "/", nil), requestID)
	if w.Code != http.StatusTooEarly || w.Header().Get("Retry-After") == "" {
		t.Fatalf("paid review replay permits new request: status=%d", w.Code)
	}
	assertCheckoutRetryState(t, pool, f, "failed", 10, 0, true)
}
