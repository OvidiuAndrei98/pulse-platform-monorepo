package payments

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stripe/stripe-go/v85"
)

func paymentSecurityTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("ISOLATION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set ISOLATION_TEST_DATABASE_URL to a migrated local spottr_security_test database")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal("invalid payment security test database config")
	}
	if cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated test database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

type refundBindingFixture struct {
	ownerID pgtype.UUID
	eventID pgtype.UUID
	orderA  pgtype.UUID
	orderB  pgtype.UUID
}

func seedRefundBindingFixture(t *testing.T, pool *pgxpool.Pool, chargeType string) refundBindingFixture {
	t.Helper()
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	var fixture refundBindingFixture
	if err := pool.QueryRow(ctx, `
		INSERT INTO users (username,email,password_hash,role,is_active)
		VALUES ($1,$2,'not-used','organizer',TRUE) RETURNING id`,
		fmt.Sprintf("refund-security-%d", suffix), fmt.Sprintf("refund-security-%d@example.invalid", suffix)).Scan(&fixture.ownerID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO events (organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status)
		VALUES ($1,'Refund security','house','Venue','Bucuresti','social',44,26,clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days','place','published')
		RETURNING id`, fixture.ownerID).Scan(&fixture.eventID); err != nil {
		t.Fatal(err)
	}
	for index, destination := range []*pgtype.UUID{&fixture.orderA, &fixture.orderB} {
		if err := pool.QueryRow(ctx, `
			INSERT INTO orders (
				event_id,email,status,total_amount,platform_fee_bani,customer_ticketing_fee_bani,
				stripe_payment_intent_id,stripe_connected_account_id,stripe_charge_type,stripe_livemode
			) VALUES ($1,$2,'completed',10,290,290,$3,'acct_refund_security',$4,TRUE)
			RETURNING id`, fixture.eventID, fmt.Sprintf("buyer-%d-%d@example.invalid", index, suffix), fmt.Sprintf("pi_refund_security_%d_%d", index, suffix), chargeType).Scan(destination); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		cleanupCtx := context.Background()
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM order_refund_operations WHERE order_id=$1 OR order_id=$2", fixture.orderA, fixture.orderB)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM orders WHERE id=$1 OR id=$2", fixture.orderA, fixture.orderB)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM events WHERE id=$1", fixture.eventID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM users WHERE id=$1", fixture.ownerID)
	})
	return fixture
}

func TestRefundWithCrossedMetadataUpdatesOnlyPaymentIntentOrder(t *testing.T) {
	for _, chargeType := range []string{directChargeType, "destination"} {
		t.Run(chargeType, func(t *testing.T) {
			pool := paymentSecurityTestPool(t)
			fixture := seedRefundBindingFixture(t, pool, chargeType)
			queries := db.New(pool)
			orderA, err := queries.GetOrderForUpdate(context.Background(), fixture.orderA)
			if err != nil {
				t.Fatal(err)
			}

			handler := &CheckoutHandler{queries: queries, db: pool}
			charge := stripe.Charge{
				ID:             "ch_crossed_metadata_" + chargeType,
				PaymentIntent:  &stripe.PaymentIntent{ID: orderA.StripePaymentIntentID.String},
				Metadata:       map[string]string{"spottr_order_id": fixture.orderB.String()},
				Amount:         1290,
				AmountRefunded: 500,
				Currency:       stripe.CurrencyRON,
				Livemode:       true,
			}
			connectedAccountID := "acct_refund_security"
			if chargeType == "destination" {
				connectedAccountID = ""
				charge.TransferData = &stripe.ChargeTransferData{Destination: &stripe.Account{ID: "acct_refund_security"}}
			}
			if err := handler.ReconcileChargeRefund(context.Background(), charge, connectedAccountID, true); err != nil {
				t.Fatal(err)
			}

			var refundedA, refundedB int64
			var attentionA, attentionB bool
			if err := pool.QueryRow(context.Background(), "SELECT stripe_amount_refunded_bani,stripe_refund_needs_attention FROM orders WHERE id=$1", fixture.orderA).Scan(&refundedA, &attentionA); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(context.Background(), "SELECT stripe_amount_refunded_bani,stripe_refund_needs_attention FROM orders WHERE id=$1", fixture.orderB).Scan(&refundedB, &attentionB); err != nil {
				t.Fatal(err)
			}
			if refundedA != 500 || !attentionA {
				t.Fatalf("actual payment order was not reconciled as partial: refunded=%d attention=%t", refundedA, attentionA)
			}
			if refundedB != 0 || attentionB {
				t.Fatalf("metadata order was modified: refunded=%d attention=%t", refundedB, attentionB)
			}
		})
	}
}

func TestUnboundRefundCannotMutateMetadataOrder(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedRefundBindingFixture(t, pool, directChargeType)
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	charge := stripe.Charge{
		ID:             "ch_unbound_metadata",
		PaymentIntent:  &stripe.PaymentIntent{ID: "pi_not_stored"},
		Metadata:       map[string]string{"spottr_order_id": fixture.orderB.String()},
		Amount:         1290,
		AmountRefunded: 1290,
		Currency:       stripe.CurrencyRON,
		Livemode:       true,
	}
	if err := handler.ReconcileChargeRefund(context.Background(), charge, "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}

	var status string
	var refunded int64
	var attention bool
	if err := pool.QueryRow(context.Background(), "SELECT status::text,stripe_amount_refunded_bani,stripe_refund_needs_attention FROM orders WHERE id=$1", fixture.orderB).Scan(&status, &refunded, &attention); err != nil {
		t.Fatal(err)
	}
	if status != "completed" || refunded != 0 || !attention {
		t.Fatalf("unbound metadata changed financial state or was not sent to review: status=%s refunded=%d attention=%t", status, refunded, attention)
	}
}

func TestPaymentIntentAndChargeCannotResolveDifferentOrders(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedRefundBindingFixture(t, pool, directChargeType)
	queries := db.New(pool)
	orderA, err := queries.GetOrderForUpdate(context.Background(), fixture.orderA)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), "UPDATE orders SET stripe_charge_id='ch_owned_by_b' WHERE id=$1", fixture.orderB); err != nil {
		t.Fatal(err)
	}

	handler := &CheckoutHandler{queries: queries, db: pool}
	charge := stripe.Charge{
		ID:             "ch_owned_by_b",
		PaymentIntent:  &stripe.PaymentIntent{ID: orderA.StripePaymentIntentID.String},
		Metadata:       map[string]string{"spottr_order_id": fixture.orderB.String()},
		Amount:         1290,
		AmountRefunded: 1290,
		Currency:       stripe.CurrencyRON,
		Livemode:       true,
	}
	if err := handler.ReconcileChargeRefund(context.Background(), charge, "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}

	var statusA, statusB string
	var refundedA, refundedB int64
	var attentionA, attentionB bool
	if err := pool.QueryRow(context.Background(), "SELECT status::text,stripe_amount_refunded_bani,stripe_refund_needs_attention FROM orders WHERE id=$1", fixture.orderA).Scan(&statusA, &refundedA, &attentionA); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), "SELECT status::text,stripe_amount_refunded_bani,stripe_refund_needs_attention FROM orders WHERE id=$1", fixture.orderB).Scan(&statusB, &refundedB, &attentionB); err != nil {
		t.Fatal(err)
	}
	if statusA != "completed" || refundedA != 0 || !attentionA {
		t.Fatalf("PaymentIntent order should only be flagged: status=%s refunded=%d attention=%t", statusA, refundedA, attentionA)
	}
	if statusB != "completed" || refundedB != 0 || attentionB {
		t.Fatalf("Charge order was modified: status=%s refunded=%d attention=%t", statusB, refundedB, attentionB)
	}
}

func TestChargeAmountAndCurrencyMismatchOnlyFlagsReview(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(*stripe.Charge)
	}{
		{name: "amount", mutate: func(charge *stripe.Charge) { charge.Amount++ }},
		{name: "currency", mutate: func(charge *stripe.Charge) { charge.Currency = stripe.CurrencyEUR }},
	} {
		t.Run(test.name, func(t *testing.T) {
			pool := paymentSecurityTestPool(t)
			fixture := seedRefundBindingFixture(t, pool, directChargeType)
			queries := db.New(pool)
			orderA, err := queries.GetOrderForUpdate(context.Background(), fixture.orderA)
			if err != nil {
				t.Fatal(err)
			}
			charge := stripe.Charge{
				ID:             "ch_invalid_" + test.name,
				PaymentIntent:  &stripe.PaymentIntent{ID: orderA.StripePaymentIntentID.String},
				Amount:         1290,
				AmountRefunded: 1290,
				Currency:       stripe.CurrencyRON,
				Livemode:       true,
			}
			test.mutate(&charge)
			handler := &CheckoutHandler{queries: queries, db: pool}
			if err := handler.ReconcileChargeRefund(context.Background(), charge, "acct_refund_security", true); err != nil {
				t.Fatal(err)
			}

			var status string
			var refunded int64
			var attention bool
			if err := pool.QueryRow(context.Background(), "SELECT status::text,stripe_amount_refunded_bani,stripe_refund_needs_attention FROM orders WHERE id=$1", fixture.orderA).Scan(&status, &refunded, &attention); err != nil {
				t.Fatal(err)
			}
			if status != "completed" || refunded != 0 || !attention {
				t.Fatalf("mismatch changed financial state or was not flagged: status=%s refunded=%d attention=%t", status, refunded, attention)
			}
		})
	}
}

func TestRefundStatusContextMismatchOnlyFlagsReview(t *testing.T) {
	for _, test := range []struct {
		name      string
		accountID string
		liveMode  bool
	}{
		{name: "account", accountID: "acct_other", liveMode: true},
		{name: "livemode", accountID: "acct_refund_security", liveMode: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			pool := paymentSecurityTestPool(t)
			fixture := seedRefundBindingFixture(t, pool, directChargeType)
			queries := db.New(pool)
			orderA, err := queries.GetOrderForUpdate(context.Background(), fixture.orderA)
			if err != nil {
				t.Fatal(err)
			}
			refund := stripe.Refund{
				ID:            "re_context_" + test.name,
				Status:        stripe.RefundStatusPending,
				PaymentIntent: &stripe.PaymentIntent{ID: orderA.StripePaymentIntentID.String},
				Charge:        &stripe.Charge{ID: "ch_context_" + test.name},
			}
			handler := &CheckoutHandler{queries: queries, db: pool}
			if err := handler.RecordRefundEvent(context.Background(), refund, test.accountID, test.liveMode); err != nil {
				t.Fatal(err)
			}

			var status string
			var refunded int64
			var attention bool
			if err := pool.QueryRow(context.Background(), "SELECT status::text,stripe_amount_refunded_bani,stripe_refund_needs_attention FROM orders WHERE id=$1", fixture.orderA).Scan(&status, &refunded, &attention); err != nil {
				t.Fatal(err)
			}
			if status != "completed" || refunded != 0 || !attention {
				t.Fatalf("context mismatch changed financial state or was not flagged: status=%s refunded=%d attention=%t", status, refunded, attention)
			}
		})
	}
}

func TestFullRefundBeforeCheckoutCompletionReleasesReservationOnce(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedRefundBindingFixture(t, pool, directChargeType)
	ctx := context.Background()
	queries := db.New(pool)

	var ticketTypeID, promoCodeID pgtype.UUID
	if err := pool.QueryRow(ctx, `
		INSERT INTO ticket_types (event_id,name,price_ron,capacity,tickets_sold,start_sales,end_sales,description)
		VALUES ($1,'Reserved',10,10,1,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day','Test')
		RETURNING id`, fixture.eventID).Scan(&ticketTypeID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO promo_codes (event_id,code,discount_percent,max_redemptions,redemptions_count)
		VALUES ($1,$2,10,10,1) RETURNING id`, fixture.eventID, "SEC"+fmt.Sprint(time.Now().UnixNano())).Scan(&promoCodeID); err != nil {
		t.Fatal(err)
	}
	const sessionID = "cs_refund_before_checkout_completed"
	const paymentIntentID = "pi_refund_before_checkout_completed"
	if _, err := pool.Exec(ctx, "UPDATE orders SET status='pending',promo_code_id=$2,stripe_payment_intent_id=NULL,stripe_checkout_session_id=$3 WHERE id=$1", fixture.orderA, promoCodeID, sessionID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES ($1,$2,1,10)", fixture.orderA, ticketTypeID); err != nil {
		t.Fatal(err)
	}
	// A retained-fee cancellation operation keeps this test focused on the
	// ordering state machine and avoids starting the asynchronous fee worker.
	if _, err := pool.Exec(ctx, `
		INSERT INTO order_refund_operations(order_id,source,fee_policy,status,refund_amount_bani)
		VALUES ($1,'event_cancellation','retain','processing',1290)`, fixture.orderA); err != nil {
		t.Fatal(err)
	}

	handler := &CheckoutHandler{
		queries: queries,
		db:      pool,
		retrieveSession: func(_ context.Context, requestedSessionID, requestedAccountID string) (*stripe.CheckoutSession, error) {
			if requestedSessionID != sessionID || requestedAccountID != "acct_refund_security" {
				t.Fatalf("unexpected Stripe retrieval scope: session=%s account=%s", requestedSessionID, requestedAccountID)
			}
			return &stripe.CheckoutSession{
				ID:                sessionID,
				ClientReferenceID: fixture.orderA.String(),
				Mode:              stripe.CheckoutSessionModePayment,
				Status:            stripe.CheckoutSessionStatusComplete,
				PaymentStatus:     stripe.CheckoutSessionPaymentStatusPaid,
				PaymentIntent:     &stripe.PaymentIntent{ID: paymentIntentID},
				AmountTotal:       1290,
				Currency:          stripe.CurrencyRON,
				Livemode:          true,
			}, nil
		},
	}
	charge := stripe.Charge{
		ID:             "ch_refund_before_checkout_completed",
		PaymentIntent:  &stripe.PaymentIntent{ID: paymentIntentID},
		Metadata:       map[string]string{"spottr_order_id": fixture.orderA.String()},
		Amount:         1290,
		AmountRefunded: 1290,
		Refunded:       true,
		Currency:       stripe.CurrencyRON,
		Livemode:       true,
	}
	if err := handler.ReconcileChargeRefund(ctx, charge, "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}
	// A delayed checkout.session.completed must remain a no-op after refund.
	if err := handler.FulfillCheckout(ctx, sessionID, paymentIntentID, fixture.orderA.String(), "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}

	var orderStatus, operationStatus, storedPaymentIntentID, storedChargeID string
	var ticketsSold, redemptions, issuedTickets int
	if err := pool.QueryRow(ctx, "SELECT status::text,stripe_payment_intent_id,stripe_charge_id FROM orders WHERE id=$1", fixture.orderA).Scan(&orderStatus, &storedPaymentIntentID, &storedChargeID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT tickets_sold FROM ticket_types WHERE id=$1", ticketTypeID).Scan(&ticketsSold); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT redemptions_count FROM promo_codes WHERE id=$1", promoCodeID).Scan(&redemptions); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM tickets WHERE order_id=$1", fixture.orderA).Scan(&issuedTickets); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT status FROM order_refund_operations WHERE order_id=$1", fixture.orderA).Scan(&operationStatus); err != nil {
		t.Fatal(err)
	}
	if orderStatus != "refunded" || storedPaymentIntentID != paymentIntentID || storedChargeID != charge.ID || ticketsSold != 0 || redemptions != 0 || issuedTickets != 0 || operationStatus != "succeeded" {
		t.Fatalf("out-of-order refund was not safely bound and terminal: order=%s pi=%s charge=%s sold=%d promo=%d tickets=%d operation=%s", orderStatus, storedPaymentIntentID, storedChargeID, ticketsSold, redemptions, issuedTickets, operationStatus)
	}
}

func TestPendingDestinationPartialRefundBindsButBlocksFulfillment(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedRefundBindingFixture(t, pool, "destination")
	ctx := context.Background()
	queries := db.New(pool)
	const sessionID = "cs_pending_destination_partial"
	const paymentIntentID = "pi_pending_destination_partial"
	if _, err := pool.Exec(ctx, "UPDATE orders SET status='pending',stripe_payment_intent_id=NULL,stripe_checkout_session_id=$2 WHERE id=$1", fixture.orderA, sessionID); err != nil {
		t.Fatal(err)
	}

	bound := make(chan struct{})
	releaseReconciliation := make(chan struct{})
	handler := &CheckoutHandler{
		queries: queries,
		db:      pool,
		retrieveSession: func(_ context.Context, requestedSessionID, requestedAccountID string) (*stripe.CheckoutSession, error) {
			if requestedSessionID != sessionID || requestedAccountID != "" {
				t.Fatalf("destination Session must be retrieved in platform scope: session=%s account=%s", requestedSessionID, requestedAccountID)
			}
			return &stripe.CheckoutSession{
				ID: sessionID, ClientReferenceID: fixture.orderA.String(), Mode: stripe.CheckoutSessionModePayment,
				Status: stripe.CheckoutSessionStatusComplete, PaymentStatus: stripe.CheckoutSessionPaymentStatusPaid,
				PaymentIntent: &stripe.PaymentIntent{ID: paymentIntentID}, AmountTotal: 1290, Currency: stripe.CurrencyRON, Livemode: true,
			}, nil
		},
		afterPendingRefundBound: func() {
			close(bound)
			<-releaseReconciliation
		},
	}
	charge := stripe.Charge{
		ID: "ch_pending_destination_partial", PaymentIntent: &stripe.PaymentIntent{ID: paymentIntentID},
		Metadata: map[string]string{"spottr_order_id": fixture.orderA.String()}, Amount: 1290, AmountRefunded: 500,
		Currency: stripe.CurrencyRON, Livemode: true,
		TransferData: &stripe.ChargeTransferData{Destination: &stripe.Account{ID: "acct_refund_security"}},
	}
	reconcileResult := make(chan error, 1)
	go func() {
		reconcileResult <- handler.ReconcileChargeRefund(ctx, charge, "", true)
	}()
	select {
	case <-bound:
	case <-time.After(5 * time.Second):
		t.Fatal("partial refund was not atomically bound")
	}
	// Exercise the exact post-bind/pre-reconciliation window. Fulfillment must
	// observe the attention flag written in the binding transaction.
	if err := handler.FulfillCheckout(ctx, sessionID, paymentIntentID, fixture.orderA.String(), "", true); err != nil {
		t.Fatal(err)
	}
	close(releaseReconciliation)
	select {
	case err := <-reconcileResult:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("partial refund reconciliation did not finish")
	}

	var status, storedPaymentIntentID, storedChargeID string
	var refunded int64
	var attention bool
	var issuedTickets int
	if err := pool.QueryRow(ctx, `
		SELECT status::text,stripe_payment_intent_id,stripe_charge_id,stripe_amount_refunded_bani,stripe_refund_needs_attention
		FROM orders WHERE id=$1`, fixture.orderA).Scan(&status, &storedPaymentIntentID, &storedChargeID, &refunded, &attention); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM tickets WHERE order_id=$1", fixture.orderA).Scan(&issuedTickets); err != nil {
		t.Fatal(err)
	}
	if status != "pending" || storedPaymentIntentID != paymentIntentID || storedChargeID != charge.ID || refunded != 500 || !attention || issuedTickets != 0 {
		t.Fatalf("partial pre-fulfillment refund was not safely held: status=%s pi=%s charge=%s refunded=%d attention=%t tickets=%d", status, storedPaymentIntentID, storedChargeID, refunded, attention, issuedTickets)
	}
}

func TestPendingRefundCannotBindToDifferentCheckoutSessionPayment(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedRefundBindingFixture(t, pool, directChargeType)
	ctx := context.Background()
	const sessionID = "cs_pending_binding_attack"
	if _, err := pool.Exec(ctx, "UPDATE orders SET status='pending',stripe_payment_intent_id=NULL,stripe_checkout_session_id=$2 WHERE id=$1", fixture.orderB, sessionID); err != nil {
		t.Fatal(err)
	}
	handler := &CheckoutHandler{
		queries: db.New(pool),
		db:      pool,
		retrieveSession: func(context.Context, string, string) (*stripe.CheckoutSession, error) {
			return &stripe.CheckoutSession{
				ID: sessionID, ClientReferenceID: fixture.orderB.String(), Mode: stripe.CheckoutSessionModePayment,
				Status: stripe.CheckoutSessionStatusComplete, PaymentStatus: stripe.CheckoutSessionPaymentStatusPaid,
				PaymentIntent: &stripe.PaymentIntent{ID: "pi_real_session_payment"}, AmountTotal: 1290, Currency: stripe.CurrencyRON, Livemode: true,
			}, nil
		},
	}
	charge := stripe.Charge{
		ID: "ch_binding_attack", PaymentIntent: &stripe.PaymentIntent{ID: "pi_other_payment"},
		Metadata: map[string]string{"spottr_order_id": fixture.orderB.String()}, Amount: 1290, AmountRefunded: 1290,
		Currency: stripe.CurrencyRON, Livemode: true, Refunded: true,
	}
	if err := handler.ReconcileChargeRefund(ctx, charge, "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}

	var status string
	var storedPaymentIntentID, storedChargeID *string
	var refunded int64
	var attention bool
	if err := pool.QueryRow(ctx, `
		SELECT status::text,stripe_payment_intent_id,stripe_charge_id,stripe_amount_refunded_bani,stripe_refund_needs_attention
		FROM orders WHERE id=$1`, fixture.orderB).Scan(&status, &storedPaymentIntentID, &storedChargeID, &refunded, &attention); err != nil {
		t.Fatal(err)
	}
	if status != "pending" || storedPaymentIntentID != nil || storedChargeID != nil || refunded != 0 || !attention {
		t.Fatalf("unverified payment was bound or changed order state: status=%s pi=%v charge=%v refunded=%d attention=%t", status, storedPaymentIntentID, storedChargeID, refunded, attention)
	}
}

func TestRefundRacingCheckoutCompletionReResolvesImmutablePayment(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedRefundBindingFixture(t, pool, directChargeType)
	ctx := context.Background()
	queries := db.New(pool)

	var ticketTypeID pgtype.UUID
	if err := pool.QueryRow(ctx, `
		INSERT INTO ticket_types (event_id,name,price_ron,capacity,tickets_sold,start_sales,end_sales,description)
		VALUES ($1,'Concurrent refund',10,10,1,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day','Test')
		RETURNING id`, fixture.eventID).Scan(&ticketTypeID); err != nil {
		t.Fatal(err)
	}
	const sessionID = "cs_refund_checkout_race"
	const paymentIntentID = "pi_refund_checkout_race"
	const chargeID = "ch_refund_checkout_race"
	if _, err := pool.Exec(ctx, "UPDATE orders SET status='pending',stripe_payment_intent_id=NULL,stripe_checkout_session_id=$2 WHERE id=$1", fixture.orderA, sessionID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES ($1,$2,1,10)", fixture.orderA, ticketTypeID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO order_refund_operations(order_id,source,fee_policy,status,refund_amount_bani)
		VALUES ($1,'event_cancellation','retain','processing',1290)`, fixture.orderA); err != nil {
		t.Fatal(err)
	}

	retrievalStarted := make(chan struct{})
	releaseRetrieval := make(chan struct{})
	handler := &CheckoutHandler{
		queries: queries,
		db:      pool,
		retrieveSession: func(_ context.Context, requestedSessionID, requestedAccountID string) (*stripe.CheckoutSession, error) {
			if requestedSessionID != sessionID || requestedAccountID != "acct_refund_security" {
				return nil, fmt.Errorf("unexpected Stripe retrieval scope: session=%s account=%s", requestedSessionID, requestedAccountID)
			}
			close(retrievalStarted)
			<-releaseRetrieval
			return &stripe.CheckoutSession{
				ID: sessionID, ClientReferenceID: fixture.orderA.String(), Mode: stripe.CheckoutSessionModePayment,
				Status: stripe.CheckoutSessionStatusComplete, PaymentStatus: stripe.CheckoutSessionPaymentStatusPaid,
				PaymentIntent: &stripe.PaymentIntent{ID: paymentIntentID}, AmountTotal: 1290, Currency: stripe.CurrencyRON, Livemode: true,
			}, nil
		},
	}
	charge := stripe.Charge{
		ID: chargeID, PaymentIntent: &stripe.PaymentIntent{ID: paymentIntentID},
		Metadata: map[string]string{"spottr_order_id": fixture.orderA.String()}, Amount: 1290, AmountRefunded: 1290,
		Currency: stripe.CurrencyRON, Livemode: true, Refunded: true,
	}

	reconcileResult := make(chan error, 1)
	go func() {
		reconcileResult <- handler.ReconcileChargeRefund(ctx, charge, "acct_refund_security", true)
	}()
	select {
	case <-retrievalStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("refund reconciliation did not reach Checkout Session retrieval")
	}
	if err := handler.FulfillCheckout(ctx, sessionID, paymentIntentID, fixture.orderA.String(), "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}
	close(releaseRetrieval)
	select {
	case err := <-reconcileResult:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("refund reconciliation did not finish")
	}

	var status, storedPaymentIntentID, storedChargeID string
	var refunded int64
	var attention bool
	var ticketsSold, issuedTickets, usableTickets int
	if err := pool.QueryRow(ctx, `
		SELECT status::text,stripe_payment_intent_id,stripe_charge_id,stripe_amount_refunded_bani,stripe_refund_needs_attention
		FROM orders WHERE id=$1`, fixture.orderA).Scan(&status, &storedPaymentIntentID, &storedChargeID, &refunded, &attention); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT tickets_sold FROM ticket_types WHERE id=$1", ticketTypeID).Scan(&ticketsSold); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM tickets WHERE order_id=$1", fixture.orderA).Scan(&issuedTickets); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		SELECT count(*) FROM tickets t JOIN orders o ON o.id=t.order_id
		WHERE t.order_id=$1 AND o.status='completed'`, fixture.orderA).Scan(&usableTickets); err != nil {
		t.Fatal(err)
	}
	if status != "refunded" || storedPaymentIntentID != paymentIntentID || storedChargeID != chargeID || refunded != 1290 || attention || ticketsSold != 0 || issuedTickets != 1 || usableTickets != 0 {
		t.Fatalf("checkout/refund race was not reconciled safely: status=%s pi=%s charge=%s refunded=%d attention=%t sold=%d issued=%d usable=%d", status, storedPaymentIntentID, storedChargeID, refunded, attention, ticketsSold, issuedTickets, usableTickets)
	}
}

func TestUnboundRefundStatusCannotHoldPendingCheckout(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedRefundBindingFixture(t, pool, directChargeType)
	ctx := context.Background()
	const sessionID = "cs_unbound_refund_status"
	const paymentIntentID = "pi_unbound_refund_status"
	var ticketTypeID pgtype.UUID
	if err := pool.QueryRow(ctx, `
		INSERT INTO ticket_types (event_id,name,price_ron,capacity,tickets_sold,start_sales,end_sales,description)
		VALUES ($1,'Unbound status',10,10,1,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 day','Test')
		RETURNING id`, fixture.eventID).Scan(&ticketTypeID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE orders SET status='pending',stripe_payment_intent_id=NULL,stripe_checkout_session_id=$2 WHERE id=$1", fixture.orderA, sessionID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES ($1,$2,1,10)", fixture.orderA, ticketTypeID); err != nil {
		t.Fatal(err)
	}

	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	for _, status := range []stripe.RefundStatus{stripe.RefundStatusPending, stripe.RefundStatusFailed} {
		refund := stripe.Refund{
			ID:            "re_unbound_" + string(status),
			Status:        status,
			PaymentIntent: &stripe.PaymentIntent{ID: paymentIntentID},
			Charge:        &stripe.Charge{ID: "ch_unbound_refund_status"},
			Metadata:      map[string]string{"spottr_order_id": fixture.orderA.String()},
		}
		if err := handler.RecordRefundEvent(ctx, refund, "acct_refund_security", true); err != nil {
			t.Fatal(err)
		}
	}

	var status string
	var storedPaymentIntentID, storedChargeID *string
	var attention bool
	if err := pool.QueryRow(ctx, `
		SELECT status::text,stripe_payment_intent_id,stripe_charge_id,stripe_refund_needs_attention
		FROM orders WHERE id=$1`, fixture.orderA).Scan(&status, &storedPaymentIntentID, &storedChargeID, &attention); err != nil {
		t.Fatal(err)
	}
	if status != "pending" || storedPaymentIntentID != nil || storedChargeID != nil || attention {
		t.Fatalf("unbound refund status held or mutated pending checkout: status=%s pi=%v charge=%v attention=%t", status, storedPaymentIntentID, storedChargeID, attention)
	}
	if err := handler.FulfillCheckout(ctx, sessionID, paymentIntentID, fixture.orderA.String(), "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}
	var issuedTickets int
	if err := pool.QueryRow(ctx, "SELECT status::text FROM orders WHERE id=$1", fixture.orderA).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM tickets WHERE order_id=$1", fixture.orderA).Scan(&issuedTickets); err != nil {
		t.Fatal(err)
	}
	if status != "completed" || issuedTickets != 1 {
		t.Fatalf("failed unbound refund attempt prevented paid checkout fulfillment: status=%s tickets=%d", status, issuedTickets)
	}
}

func TestFailedVerifiedRefundStatusReleasesPendingCheckoutHold(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedRefundBindingFixture(t, pool, directChargeType)
	ctx := context.Background()
	queries := db.New(pool)
	order, err := queries.GetOrderForUpdate(ctx, fixture.orderA)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "UPDATE orders SET status='pending' WHERE id=$1", fixture.orderA); err != nil {
		t.Fatal(err)
	}
	refund := stripe.Refund{
		ID:            "re_verified_status",
		PaymentIntent: &stripe.PaymentIntent{ID: order.StripePaymentIntentID.String},
		Charge:        &stripe.Charge{ID: "ch_verified_status"},
	}
	handler := &CheckoutHandler{queries: queries, db: pool}
	refund.Status = stripe.RefundStatusPending
	if err := handler.RecordRefundEvent(ctx, refund, "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}
	var attention bool
	if err := pool.QueryRow(ctx, "SELECT stripe_refund_needs_attention FROM orders WHERE id=$1", fixture.orderA).Scan(&attention); err != nil {
		t.Fatal(err)
	}
	if !attention {
		t.Fatal("verified pending refund did not hold checkout")
	}
	refund.Status = stripe.RefundStatusCanceled
	if err := handler.RecordRefundEvent(ctx, refund, "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}
	var refundStatus string
	if err := pool.QueryRow(ctx, "SELECT stripe_refund_status,stripe_refund_needs_attention FROM orders WHERE id=$1", fixture.orderA).Scan(&refundStatus, &attention); err != nil {
		t.Fatal(err)
	}
	if refundStatus != "failed" || attention {
		t.Fatalf("failed verified refund did not release checkout hold: status=%s attention=%t", refundStatus, attention)
	}
}

func TestDelayedRefundStatusCannotRegressCumulativeRefund(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedRefundBindingFixture(t, pool, directChargeType)
	ctx := context.Background()
	queries := db.New(pool)
	order, err := queries.GetOrderForUpdate(ctx, fixture.orderA)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		UPDATE orders SET status='refunded',stripe_amount_refunded_bani=1290,
		stripe_refund_status='succeeded',stripe_refund_needs_attention=FALSE
		WHERE id=$1`, fixture.orderA); err != nil {
		t.Fatal(err)
	}
	refund := stripe.Refund{
		ID:            "re_delayed_failed",
		Status:        stripe.RefundStatusFailed,
		PaymentIntent: &stripe.PaymentIntent{ID: order.StripePaymentIntentID.String},
		Charge:        &stripe.Charge{ID: "ch_delayed_failed"},
	}
	if err := (&CheckoutHandler{queries: queries, db: pool}).RecordRefundEvent(ctx, refund, "acct_refund_security", true); err != nil {
		t.Fatal(err)
	}
	var status, refundStatus string
	var refunded int64
	var attention bool
	if err := pool.QueryRow(ctx, `
		SELECT status::text,stripe_refund_status,stripe_amount_refunded_bani,stripe_refund_needs_attention
		FROM orders WHERE id=$1`, fixture.orderA).Scan(&status, &refundStatus, &refunded, &attention); err != nil {
		t.Fatal(err)
	}
	if status != "refunded" || refundStatus != "succeeded" || refunded != 1290 || attention {
		t.Fatalf("delayed refund status regressed cumulative state: status=%s refund=%s amount=%d attention=%t", status, refundStatus, refunded, attention)
	}
}
