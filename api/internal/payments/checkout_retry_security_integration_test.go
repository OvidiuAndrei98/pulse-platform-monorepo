package payments

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stripe/stripe-go/v85"
)

type checkoutRetryFixture struct {
	ownerID     pgtype.UUID
	eventID     pgtype.UUID
	ticketType  pgtype.UUID
	orderID     pgtype.UUID
	sessionID   string
	paymentID   string
	accountID   string
	initialSold int32
}

func seedCheckoutRetryFixture(t *testing.T, pool *pgxpool.Pool, status string, initialSold, capacity int32) checkoutRetryFixture {
	t.Helper()
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	fixture := checkoutRetryFixture{
		sessionID:   fmt.Sprintf("cs_retry_security_%d", suffix),
		paymentID:   fmt.Sprintf("pi_retry_security_%d", suffix),
		accountID:   fmt.Sprintf("acct_retry_security_%d", suffix),
		initialSold: initialSold,
	}
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active)
VALUES($1,$2,'not-used','organizer',TRUE) RETURNING id`, fmt.Sprintf("retry-owner-%d", suffix), fmt.Sprintf("retry-owner-%d@example.invalid", suffix)).Scan(&fixture.ownerID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status)
VALUES($1,'Checkout retry security','house','Venue','Bucuresti','social',44,26,clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days',$2,'published') RETURNING id`, fixture.ownerID, fmt.Sprintf("retry-place-%d", suffix)).Scan(&fixture.eventID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,tickets_sold,start_sales,end_sales)
VALUES($1,'General',50,$2,$3,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day') RETURNING id`, fixture.eventID, capacity, initialSold).Scan(&fixture.ticketType); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO orders(event_id,email,status,total_amount,stripe_payment_intent_id,stripe_checkout_session_id,stripe_connected_account_id,stripe_charge_type,stripe_livemode)
VALUES($1,$2,$3::order_status,100,$4,$5,$6,'direct',TRUE) RETURNING id`, fixture.eventID, fmt.Sprintf("retry-buyer-%d@example.invalid", suffix), status, fixture.paymentID, fixture.sessionID, fixture.accountID).Scan(&fixture.orderID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES($1,$2,2,50)`, fixture.orderID, fixture.ticketType); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupCtx := context.Background()
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM checkout_reservation_reviews WHERE order_id=$1", fixture.orderID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM notifications WHERE event_id=$1", fixture.eventID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM orders WHERE id=$1", fixture.orderID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM ticket_types WHERE id=$1", fixture.ticketType)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM events WHERE id=$1", fixture.eventID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM users WHERE id=$1", fixture.ownerID)
	})
	return fixture
}

func TestDirectPaymentIntentFailureIsNonTerminal(t *testing.T) {
	payload, err := json.Marshal(stripe.PaymentIntent{ID: "pi_retryable_failure"})
	if err != nil {
		t.Fatal(err)
	}
	handler := &ConnectWebhookHandler{}
	event := stripe.Event{
		Type:    stripe.EventTypePaymentIntentPaymentFailed,
		Account: "acct_retryable_failure",
		Data:    &stripe.EventData{Raw: payload},
	}
	handled, err := handler.handleDirectChargeEvent(httptest.NewRequest("POST", "/", nil), event)
	if err != nil {
		t.Fatal(err)
	}
	if !handled {
		t.Fatal("payment failure event was not acknowledged")
	}
}

func TestExpiredCheckoutRequiresExactPersistedSession(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedCheckoutRetryFixture(t, pool, "pending", 2, 10)
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	ctx := context.Background()

	forged := stripe.CheckoutSession{ID: "cs_forged_with_copied_metadata", Status: stripe.CheckoutSessionStatusExpired, Livemode: true}
	if err := handler.ReleaseExpiredCheckout(ctx, forged, fixture.accountID); err != nil {
		t.Fatal(err)
	}
	assertCheckoutRetryState(t, pool, fixture, "pending", 2, 0, false)

	exact := stripe.CheckoutSession{ID: fixture.sessionID, Status: stripe.CheckoutSessionStatusExpired, Livemode: true}
	if err := handler.ReleaseExpiredCheckout(ctx, exact, fixture.accountID); err != nil {
		t.Fatal(err)
	}
	assertCheckoutRetryState(t, pool, fixture, "failed", 0, 0, false)

	// Stripe retries webhook deliveries; releasing the same reservation twice
	// must remain idempotent.
	if err := handler.ReleaseExpiredCheckout(ctx, exact, fixture.accountID); err != nil {
		t.Fatal(err)
	}
	assertCheckoutRetryState(t, pool, fixture, "failed", 0, 0, false)
}

func TestPaidRetryRestoresReleasedInventoryAndFulfills(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedCheckoutRetryFixture(t, pool, "failed", 0, 10)
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}

	if err := handler.FulfillCheckout(context.Background(), fixture.sessionID, fixture.paymentID, fixture.orderID.String(), fixture.accountID, true); err != nil {
		t.Fatal(err)
	}
	assertCheckoutRetryState(t, pool, fixture, "completed", 2, 2, false)

	// Delayed/retried success delivery is idempotent and cannot duplicate tickets.
	if err := handler.FulfillCheckout(context.Background(), fixture.sessionID, fixture.paymentID, fixture.orderID.String(), fixture.accountID, true); err != nil {
		t.Fatal(err)
	}
	assertCheckoutRetryState(t, pool, fixture, "completed", 2, 2, false)
}

func TestConcurrentPaidRetryIssuesTicketsOnce(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedCheckoutRetryFixture(t, pool, "failed", 0, 10)
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	var wait sync.WaitGroup
	errorsSeen := make(chan error, 2)
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			errorsSeen <- handler.FulfillCheckout(context.Background(), fixture.sessionID, fixture.paymentID, fixture.orderID.String(), fixture.accountID, true)
		}()
	}
	wait.Wait()
	close(errorsSeen)
	for err := range errorsSeen {
		if err != nil {
			t.Fatal(err)
		}
	}
	assertCheckoutRetryState(t, pool, fixture, "completed", 2, 2, false)
}

func TestPaidRetryWithoutCapacityIsQuarantinedForRefund(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedCheckoutRetryFixture(t, pool, "failed", 10, 10)
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}

	if err := handler.FulfillCheckout(context.Background(), fixture.sessionID, fixture.paymentID, fixture.orderID.String(), fixture.accountID, true); err != nil {
		t.Fatal(err)
	}
	assertCheckoutRetryState(t, pool, fixture, "failed", 10, 0, true)
	var reason string
	if err := pool.QueryRow(context.Background(), `SELECT reason FROM checkout_reservation_reviews WHERE order_id=$1`, fixture.orderID).Scan(&reason); err != nil {
		t.Fatal(err)
	}
	if reason != "paid_after_inventory_release" {
		t.Fatalf("review reason = %q", reason)
	}
}

func TestPaidRetryWithoutPromoCapacityRollsBackTicketRestore(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedCheckoutRetryFixture(t, pool, "failed", 0, 10)
	ctx := context.Background()
	var promoID pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO promo_codes(event_id,code,discount_percent,max_redemptions,redemptions_count)
VALUES($1,$2,10,1,1) RETURNING id`, fixture.eventID, fmt.Sprintf("RETRY-%d", time.Now().UnixNano())).Scan(&promoID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE orders SET promo_code_id=$2 WHERE id=$1`, fixture.orderID, promoID); err != nil {
		t.Fatal(err)
	}
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	if err := handler.FulfillCheckout(ctx, fixture.sessionID, fixture.paymentID, fixture.orderID.String(), fixture.accountID, true); err != nil {
		t.Fatal(err)
	}
	// Ticket restoration happened before promo restoration inside the savepoint;
	// both must roll back when the promotion has already been consumed.
	assertCheckoutRetryState(t, pool, fixture, "failed", 0, 0, true)
	var redemptions int32
	if err := pool.QueryRow(ctx, `SELECT redemptions_count FROM promo_codes WHERE id=$1`, promoID).Scan(&redemptions); err != nil {
		t.Fatal(err)
	}
	if redemptions != 1 {
		t.Fatalf("promo redemptions = %d, want 1", redemptions)
	}
}

func TestPaidCheckoutAfterEventCancellationIsQuarantined(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		status string
		sold   int32
	}{
		{name: "pending reservation", status: "pending", sold: 2},
		{name: "previously released reservation", status: "failed", sold: 0},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			pool := paymentSecurityTestPool(t)
			fixture := seedCheckoutRetryFixture(t, pool, testCase.status, testCase.sold, 10)
			if testCase.status == "pending" {
				// Stripe often does not expose the PaymentIntent when the Session is
				// first created; fulfillment must bind it before refund quarantine.
				if _, err := pool.Exec(context.Background(), `UPDATE orders SET stripe_payment_intent_id=NULL WHERE id=$1`, fixture.orderID); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := pool.Exec(context.Background(), `UPDATE events SET status='cancel_pending' WHERE id=$1`, fixture.eventID); err != nil {
				t.Fatal(err)
			}
			handler := &CheckoutHandler{queries: db.New(pool), db: pool}
			if err := handler.FulfillCheckout(context.Background(), fixture.sessionID, fixture.paymentID, fixture.orderID.String(), fixture.accountID, true); err != nil {
				t.Fatal(err)
			}
			assertCheckoutRetryState(t, pool, fixture, testCase.status, testCase.sold, 0, true)
			var reason string
			if err := pool.QueryRow(context.Background(), `SELECT reason FROM checkout_reservation_reviews WHERE order_id=$1`, fixture.orderID).Scan(&reason); err != nil {
				t.Fatal(err)
			}
			if reason != "paid_after_event_closed" {
				t.Fatalf("review reason = %q", reason)
			}
			var storedPaymentIntentID string
			if err := pool.QueryRow(context.Background(), `SELECT stripe_payment_intent_id FROM orders WHERE id=$1`, fixture.orderID).Scan(&storedPaymentIntentID); err != nil {
				t.Fatal(err)
			}
			if storedPaymentIntentID != fixture.paymentID {
				t.Fatalf("stored payment intent = %q, want %q", storedPaymentIntentID, fixture.paymentID)
			}
		})
	}
}

func TestReconcilePaidCheckoutDoesNotReportSuccessWithoutTickets(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedCheckoutRetryFixture(t, pool, "failed", 10, 10)
	handler := &CheckoutHandler{
		queries: db.New(pool),
		db:      pool,
		retrieveSession: func(_ context.Context, sessionID, accountID string) (*stripe.CheckoutSession, error) {
			if sessionID != fixture.sessionID || accountID != fixture.accountID {
				t.Fatalf("unexpected Stripe lookup: session=%s account=%s", sessionID, accountID)
			}
			return &stripe.CheckoutSession{
				ID:            fixture.sessionID,
				Status:        stripe.CheckoutSessionStatusComplete,
				PaymentStatus: stripe.CheckoutSessionPaymentStatusPaid,
				Livemode:      true,
				Metadata:      map[string]string{"spottr_order_id": fixture.orderID.String()},
				PaymentIntent: &stripe.PaymentIntent{ID: fixture.paymentID},
			}, nil
		},
	}

	status, orderID, err := handler.reconcileCheckoutSession(context.Background(), fixture.sessionID, fixture.eventID.String())
	if err != nil {
		t.Fatal(err)
	}
	if status != "failed" || orderID != fixture.orderID.String() {
		t.Fatalf("reconciliation returned %q/%q, want failed/%s", status, orderID, fixture.orderID.String())
	}
	assertCheckoutRetryState(t, pool, fixture, "failed", 10, 0, true)
}

func TestRefundAttentionOrdersDoNotStarvePendingReconciliation(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	attention := seedCheckoutRetryFixture(t, pool, "pending", 2, 10)
	normal := seedCheckoutRetryFixture(t, pool, "pending", 2, 10)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE orders SET created_at=clock_timestamp()-interval '1 minute' WHERE id=$1 OR id=$2`, attention.orderID, normal.orderID); err != nil {
		t.Fatal(err)
	}
	queries := db.New(pool)
	if err := queries.MarkOrderRefundNeedsAttention(ctx, attention.orderID); err != nil {
		t.Fatal(err)
	}
	orders, err := queries.ListPendingDirectChargeCheckoutsForReconciliation(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var foundAttention, foundNormal bool
	for _, order := range orders {
		foundAttention = foundAttention || order.ID == attention.orderID
		foundNormal = foundNormal || order.ID == normal.orderID
	}
	if foundAttention || !foundNormal {
		t.Fatalf("reconciliation selection attention=%t normal=%t, want false/true", foundAttention, foundNormal)
	}
}

func assertCheckoutRetryState(t *testing.T, pool *pgxpool.Pool, fixture checkoutRetryFixture, wantStatus string, wantSold, wantTickets int32, wantAttention bool) {
	t.Helper()
	var status string
	var sold int32
	var ticketCount int32
	var attention bool
	if err := pool.QueryRow(context.Background(), `SELECT o.status::text,tt.tickets_sold,
(SELECT COUNT(*)::int FROM tickets WHERE order_id=o.id),o.stripe_refund_needs_attention
FROM orders o JOIN ticket_types tt ON tt.id=$2 WHERE o.id=$1`, fixture.orderID, fixture.ticketType).Scan(&status, &sold, &ticketCount, &attention); err != nil {
		t.Fatal(err)
	}
	if status != wantStatus || sold != wantSold || ticketCount != wantTickets || attention != wantAttention {
		t.Fatalf("status=%s sold=%d tickets=%d attention=%t; want %s/%d/%d/%t", status, sold, ticketCount, attention, wantStatus, wantSold, wantTickets, wantAttention)
	}
}
