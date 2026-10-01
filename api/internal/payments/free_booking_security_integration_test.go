package payments

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type freeBookingFixture struct {
	ownerID          pgtype.UUID
	buyerID          pgtype.UUID
	secondBuyerID    pgtype.UUID
	eventID          pgtype.UUID
	freeTicketID     pgtype.UUID
	paidTicketID     pgtype.UUID
	buyerEmail       string
	secondBuyerEmail string
}

func seedFreeBookingFixture(t *testing.T, pool *pgxpool.Pool) freeBookingFixture {
	t.Helper()
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	fixture := freeBookingFixture{
		buyerEmail:       fmt.Sprintf("free-buyer-%d@example.invalid", suffix),
		secondBuyerEmail: fmt.Sprintf("free-buyer-two-%d@example.invalid", suffix),
	}
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active)
VALUES($1,$2,'not-used','organizer',TRUE) RETURNING id`, fmt.Sprintf("free-owner-%d", suffix), fmt.Sprintf("free-owner-%d@example.invalid", suffix)).Scan(&fixture.ownerID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active)
VALUES($1,$2,'not-used','user',TRUE) RETURNING id`, fmt.Sprintf("free-buyer-%d", suffix), fixture.buyerEmail).Scan(&fixture.buyerID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active)
VALUES($1,$2,'not-used','user',TRUE) RETURNING id`, fmt.Sprintf("free-buyer-two-%d", suffix), fixture.secondBuyerEmail).Scan(&fixture.secondBuyerID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO organizer_profiles(
user_id,cui,company_name,fiscal_address,is_verified,verification_status,
stripe_account_id,stripe_charges_enabled,stripe_payouts_enabled,stripe_details_submitted,stripe_charge_type)
VALUES($1,$2,'Free Booking Test SRL','Test address',TRUE,'approved',$3,TRUE,TRUE,TRUE,'direct')`,
		fixture.ownerID, fmt.Sprintf("T%015d", suffix%1_000_000_000_000_000), fmt.Sprintf("acct_test_free_%d", suffix)); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status,vat_percentage)
VALUES($1,'Free booking security','house','Venue','Bucuresti','social',44,26,clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days',$2,'published',0) RETURNING id`, fixture.ownerID, fmt.Sprintf("free-place-%d", suffix)).Scan(&fixture.eventID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales)
VALUES($1,'Free',0,10,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day') RETURNING id`, fixture.eventID).Scan(&fixture.freeTicketID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales)
VALUES($1,'Paid',50,10,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day') RETURNING id`, fixture.eventID).Scan(&fixture.paidTicketID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		cleanupCtx := context.Background()
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM notifications WHERE event_id=$1", fixture.eventID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM event_cancellation_requests WHERE event_id=$1", fixture.eventID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM orders WHERE event_id=$1", fixture.eventID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM ticket_types WHERE event_id=$1", fixture.eventID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM events WHERE id=$1", fixture.eventID)
		_, _ = pool.Exec(cleanupCtx, "DELETE FROM users WHERE id=$1 OR id=$2 OR id=$3", fixture.ownerID, fixture.buyerID, fixture.secondBuyerID)
	})
	return fixture
}

func TestFreeBookingIsAtomicAndIdempotent(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedFreeBookingFixture(t, pool)
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	requested := map[string]int32{common.UUIDToString(fixture.freeTicketID): 1}

	type result struct {
		orderID pgtype.UUID
		reused  bool
		err     error
	}
	results := make(chan result, 2)
	var group sync.WaitGroup
	for range 2 {
		group.Add(1)
		go func() {
			defer group.Done()
			orderID, reused, err := handler.bookFreeTicket(context.Background(), fixture.eventID, fixture.buyerID, fixture.buyerEmail, requested)
			results <- result{orderID: orderID, reused: reused, err: err}
		}()
	}
	group.Wait()
	close(results)

	var firstOrder pgtype.UUID
	created, reused := 0, 0
	for value := range results {
		if value.err != nil {
			t.Fatal(value.err)
		}
		if !firstOrder.Valid {
			firstOrder = value.orderID
		} else if firstOrder != value.orderID {
			t.Fatalf("concurrent retries produced different orders: %v != %v", firstOrder, value.orderID)
		}
		if value.reused {
			reused++
		} else {
			created++
		}
	}
	if created != 1 || reused != 1 {
		t.Fatalf("expected one booking and one idempotent retry, got created=%d reused=%d", created, reused)
	}

	var sold, tickets, orderItems int
	var status string
	var total, platformFee, customerFee int
	var invoiceRequested bool
	var completedAt pgtype.Timestamptz
	if err := pool.QueryRow(context.Background(), `SELECT tickets_sold FROM ticket_types WHERE id=$1`, fixture.freeTicketID).Scan(&sold); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT status::text,total_amount,platform_fee_bani,customer_ticketing_fee_bani,invoice_requested,completed_at FROM orders WHERE id=$1`, firstOrder).Scan(&status, &total, &platformFee, &customerFee, &invoiceRequested, &completedAt); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM tickets WHERE order_id=$1`, firstOrder).Scan(&tickets); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM order_items WHERE order_id=$1`, firstOrder).Scan(&orderItems); err != nil {
		t.Fatal(err)
	}
	if sold != 1 || tickets != 1 || orderItems != 1 || status != "completed" || total != 0 || platformFee != 0 || customerFee != 0 || invoiceRequested || !completedAt.Valid {
		t.Fatalf("invalid free booking state: sold=%d tickets=%d items=%d status=%s total=%d platform=%d customer=%d invoice=%v completed=%v", sold, tickets, orderItems, status, total, platformFee, customerFee, invoiceRequested, completedAt.Valid)
	}

	var validationHash string
	if err := pool.QueryRow(context.Background(), `SELECT validation_hash FROM tickets WHERE order_id=$1`, firstOrder).Scan(&validationHash); err != nil {
		t.Fatal(err)
	}

	var cancellationID pgtype.UUID
	if err := pool.QueryRow(context.Background(), `INSERT INTO event_cancellation_requests(event_id,organizer_id,previous_event_status,reason,status)
VALUES($1,$2,'published','integration test','pending') RETURNING id`, fixture.eventID, fixture.ownerID).Scan(&cancellationID); err != nil {
		t.Fatal(err)
	}
	queries := db.New(pool)
	if _, err := queries.ApproveEventCancellation(context.Background(), db.ApproveEventCancellationParams{
		ID: cancellationID, ReviewedBy: fixture.ownerID, FeePolicy: pgtype.Text{String: "retain", Valid: true},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := queries.FinalizeEmptyCancellationRequests(context.Background()); err != nil {
		t.Fatal(err)
	}
	var cancelledOrderStatus, stripeRefundStatus, eventStatus string
	var refundOperations int
	if err := pool.QueryRow(context.Background(), `SELECT status::text,stripe_refund_status FROM orders WHERE id=$1`, firstOrder).Scan(&cancelledOrderStatus, &stripeRefundStatus); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT status FROM events WHERE id=$1`, fixture.eventID).Scan(&eventStatus); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM order_refund_operations WHERE order_id=$1`, firstOrder).Scan(&refundOperations); err != nil {
		t.Fatal(err)
	}
	if cancelledOrderStatus != "refunded" || stripeRefundStatus != "none" || eventStatus != "cancelled" || refundOperations != 0 {
		t.Fatalf("free cancellation entered Stripe flow: order=%s stripe=%s event=%s operations=%d", cancelledOrderStatus, stripeRefundStatus, eventStatus, refundOperations)
	}
	if _, err := queries.GetTicketByHash(context.Background(), validationHash); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("cancelled free ticket remained scannable: %v", err)
	}
}

func TestFreeBookingLastSeatIsAtomicAcrossUsers(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedFreeBookingFixture(t, pool)
	if _, err := pool.Exec(context.Background(), `UPDATE ticket_types SET capacity=1 WHERE id=$1`, fixture.freeTicketID); err != nil {
		t.Fatal(err)
	}
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	requested := map[string]int32{common.UUIDToString(fixture.freeTicketID): 1}

	type result struct {
		err error
	}
	results := make(chan result, 2)
	var group sync.WaitGroup
	for _, buyer := range []struct {
		id    pgtype.UUID
		email string
	}{{fixture.buyerID, fixture.buyerEmail}, {fixture.secondBuyerID, fixture.secondBuyerEmail}} {
		buyer := buyer
		group.Add(1)
		go func() {
			defer group.Done()
			_, _, err := handler.bookFreeTicket(context.Background(), fixture.eventID, buyer.id, buyer.email, requested)
			results <- result{err: err}
		}()
	}
	group.Wait()
	close(results)

	succeeded, soldOut := 0, 0
	for value := range results {
		if value.err == nil {
			succeeded++
			continue
		}
		var requestError *checkoutRequestError
		if errors.As(value.err, &requestError) && requestError.status == 409 {
			soldOut++
			continue
		}
		t.Fatalf("unexpected last-seat result: %v", value.err)
	}
	var sold, tickets int
	if err := pool.QueryRow(context.Background(), `SELECT tickets_sold FROM ticket_types WHERE id=$1`, fixture.freeTicketID).Scan(&sold); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM tickets WHERE ticket_type_id=$1`, fixture.freeTicketID).Scan(&tickets); err != nil {
		t.Fatal(err)
	}
	if succeeded != 1 || soldOut != 1 || sold != 1 || tickets != 1 {
		t.Fatalf("last free seat oversold: success=%d sold_out=%d sold=%d tickets=%d", succeeded, soldOut, sold, tickets)
	}
}

func TestFreeBookingRejectsPaidTicketType(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedFreeBookingFixture(t, pool)
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	_, _, err := handler.bookFreeTicket(context.Background(), fixture.eventID, fixture.buyerID, fixture.buyerEmail, map[string]int32{common.UUIDToString(fixture.paidTicketID): 1})
	var requestError *checkoutRequestError
	if err == nil || !errors.As(err, &requestError) || requestError.status != 400 {
		t.Fatalf("expected paid ticket rejection, got %v", err)
	}
}

func TestPaidOrderForSameTierDoesNotMasqueradeAsExistingFreeBooking(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedFreeBookingFixture(t, pool)
	var paidOrderID pgtype.UUID
	if err := pool.QueryRow(context.Background(), `INSERT INTO orders(
user_id,event_id,email,total_amount,platform_fee_bani,customer_ticketing_fee_bani,status,invoice_requested,completed_at)
VALUES($1,$2,$3,50,0,0,'completed',TRUE,CURRENT_TIMESTAMP) RETURNING id`,
		fixture.buyerID, fixture.eventID, fixture.buyerEmail).Scan(&paidOrderID); err != nil {
		t.Fatal(err)
	}
	// Model a ticket bought while this same tier used to cost money. The current
	// ticket type is free, but that historical paid order must not satisfy a new
	// free booking attempt.
	if _, err := pool.Exec(context.Background(), `INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES($1,$2,1,50)`, paidOrderID, fixture.freeTicketID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash) VALUES($1,$2,$3,$4)`, paidOrderID, fixture.freeTicketID, fixture.buyerID, fmt.Sprintf("paid-existing-%d", time.Now().UnixNano())); err != nil {
		t.Fatal(err)
	}

	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	freeOrderID, reused, err := handler.bookFreeTicket(context.Background(), fixture.eventID, fixture.buyerID, fixture.buyerEmail, map[string]int32{common.UUIDToString(fixture.freeTicketID): 1})
	if err != nil {
		t.Fatal(err)
	}
	if reused || freeOrderID == paidOrderID {
		t.Fatalf("paid ticket was treated as the requested free booking: reused=%v paid=%v free=%v", reused, paidOrderID, freeOrderID)
	}
	var freeTickets int
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM tickets WHERE order_id=$1 AND ticket_type_id=$2`, freeOrderID, fixture.freeTicketID).Scan(&freeTickets); err != nil {
		t.Fatal(err)
	}
	if freeTickets != 1 {
		t.Fatalf("free booking did not issue the selected ticket type: tickets=%d", freeTickets)
	}
}

func TestPaidCheckoutRejectsFreeTicketType(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedFreeBookingFixture(t, pool)
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}
	_, _, _, _, _, _, err := handler.reserveOrder(
		context.Background(),
		fixture.eventID,
		fixture.buyerID,
		fixture.buyerEmail,
		nil,
		map[string]int32{common.UUIDToString(fixture.freeTicketID): 1},
		1,
		"",
		BillingDetailsRequest{
			Type: "individual", Name: "Free Buyer", Address: "Test street 1",
			City: "Cluj-Napoca", County: "Cluj", Country: "Romania",
		},
	)
	var requestError *checkoutRequestError
	if err == nil || !errors.As(err, &requestError) || requestError.status != 400 {
		t.Fatalf("expected paid checkout to reject a free ticket, got %v", err)
	}
	var sold int
	if err := pool.QueryRow(context.Background(), `SELECT tickets_sold FROM ticket_types WHERE id=$1`, fixture.freeTicketID).Scan(&sold); err != nil {
		t.Fatal(err)
	}
	if sold != 0 {
		t.Fatalf("paid checkout rejection consumed free inventory: sold=%d", sold)
	}
}

func TestExternalTicketEventRejectsSpottrBookingAndCheckout(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedFreeBookingFixture(t, pool)
	// External ticketing cannot be enabled once Spottr ticketing artifacts exist.
	// Remove the fixture's unused ticket types so this test exercises the API
	// guards on a valid external-only event.
	if _, err := pool.Exec(context.Background(), `DELETE FROM ticket_types WHERE event_id=$1`, fixture.eventID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `UPDATE events SET external_ticket_url='https://tickets.example.test/event' WHERE id=$1`, fixture.eventID); err != nil {
		t.Fatal(err)
	}
	handler := &CheckoutHandler{queries: db.New(pool), db: pool}

	_, _, freeErr := handler.bookFreeTicket(
		context.Background(), fixture.eventID, fixture.buyerID, fixture.buyerEmail,
		map[string]int32{common.UUIDToString(fixture.freeTicketID): 1},
	)
	var freeRequestError *checkoutRequestError
	if !errors.As(freeErr, &freeRequestError) || freeRequestError.status != 409 {
		t.Fatalf("expected external event to reject free booking, got %v", freeErr)
	}

	_, _, _, _, _, _, paidErr := handler.reserveOrder(
		context.Background(), fixture.eventID, fixture.buyerID, fixture.buyerEmail, nil,
		map[string]int32{common.UUIDToString(fixture.paidTicketID): 1}, 1, "",
		BillingDetailsRequest{
			Type: "individual", Name: "External Buyer", Address: "Test street 1",
			City: "Cluj-Napoca", County: "Cluj", Country: "Romania",
		},
	)
	var paidRequestError *checkoutRequestError
	if !errors.As(paidErr, &paidRequestError) || paidRequestError.status != 409 {
		t.Fatalf("expected external event to reject paid checkout, got %v", paidErr)
	}

	var orders, sold int
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(*) FROM orders WHERE event_id=$1`, fixture.eventID).Scan(&orders); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT COALESCE(SUM(tickets_sold),0) FROM ticket_types WHERE event_id=$1`, fixture.eventID).Scan(&sold); err != nil {
		t.Fatal(err)
	}
	if orders != 0 || sold != 0 {
		t.Fatalf("external event mutated Spottr sales state: orders=%d sold=%d", orders, sold)
	}
}

func TestExternalTicketingDatabaseGuardsSerializeModeChanges(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedFreeBookingFixture(t, pool)
	ctx := context.Background()

	// Start from an event without ticketing state, then create a ticket type in
	// an uncommitted transaction. Its trigger holds a shared event lock.
	if _, err := pool.Exec(ctx, `DELETE FROM ticket_types WHERE event_id=$1`, fixture.eventID); err != nil {
		t.Fatal(err)
	}
	artifactTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := artifactTx.Exec(ctx, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales)
VALUES($1,'Concurrent',25,10,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day')`, fixture.eventID); err != nil {
		_ = artifactTx.Rollback(ctx)
		t.Fatal(err)
	}

	transitionResult := make(chan error, 1)
	go func() {
		_, updateErr := pool.Exec(context.Background(), `UPDATE events SET external_ticket_url='https://tickets.example.test/concurrent' WHERE id=$1`, fixture.eventID)
		transitionResult <- updateErr
	}()
	select {
	case earlyErr := <-transitionResult:
		_ = artifactTx.Rollback(ctx)
		t.Fatalf("ticketing-mode update did not wait for concurrent artifact insert: %v", earlyErr)
	case <-time.After(100 * time.Millisecond):
	}
	if err := artifactTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := <-transitionResult; err == nil {
		t.Fatal("external ticketing was enabled after a concurrent Spottr artifact committed")
	}

	var externalURL pgtype.Text
	if err := pool.QueryRow(ctx, `SELECT external_ticket_url FROM events WHERE id=$1`, fixture.eventID).Scan(&externalURL); err != nil {
		t.Fatal(err)
	}
	if externalURL.Valid {
		t.Fatalf("failed transition changed external URL to %q", externalURL.String)
	}

	// Exercise the inverse race too: once all artifacts are gone, hold the
	// external transition open and start an old-style ticket insert. The insert
	// must wait, then fail after the transition commits.
	if _, err := pool.Exec(ctx, `DELETE FROM ticket_types WHERE event_id=$1`, fixture.eventID); err != nil {
		t.Fatal(err)
	}
	modeTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := modeTx.Exec(ctx, `UPDATE events SET external_ticket_url='https://tickets.example.test/final' WHERE id=$1`, fixture.eventID); err != nil {
		_ = modeTx.Rollback(ctx)
		t.Fatal(err)
	}
	artifactResult := make(chan error, 1)
	go func() {
		_, insertErr := pool.Exec(context.Background(), `INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales)
VALUES($1,'Forbidden',25,10,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day')`, fixture.eventID)
		artifactResult <- insertErr
	}()
	select {
	case earlyErr := <-artifactResult:
		_ = modeTx.Rollback(ctx)
		t.Fatalf("artifact insert did not wait for concurrent ticketing-mode transition: %v", earlyErr)
	case <-time.After(100 * time.Millisecond):
	}
	if err := modeTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if err := <-artifactResult; err == nil {
		t.Fatal("external event accepted a Spottr ticket type after concurrent transition")
	}
}

func TestExternalTicketingDatabaseRejectsEveryArtifactCategory(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	fixture := seedFreeBookingFixture(t, pool)
	ctx := context.Background()

	tests := []struct {
		name   string
		insert func(pgx.Tx, pgtype.UUID) error
	}{
		{
			name: "ticket type",
			insert: func(tx pgx.Tx, eventID pgtype.UUID) error {
				_, err := tx.Exec(ctx, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales)
VALUES($1,'Existing',25,10,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day')`, eventID)
				return err
			},
		},
		{
			name: "order",
			insert: func(tx pgx.Tx, eventID pgtype.UUID) error {
				_, err := tx.Exec(ctx, `INSERT INTO orders(user_id,event_id,email,total_amount,status)
VALUES($1,$2,$3,25,'pending')`, fixture.buyerID, eventID, fixture.buyerEmail)
				return err
			},
		},
		{
			name: "invitation",
			insert: func(tx pgx.Tx, eventID pgtype.UUID) error {
				_, err := tx.Exec(ctx, `INSERT INTO invitation_tickets(event_id,created_by,label,validation_hash)
VALUES($1,$2,'Existing invitation',$3)`, eventID, fixture.ownerID, fmt.Sprintf("external-guard-invitation-%d", time.Now().UnixNano()))
				return err
			},
		},
		{
			name: "promo code",
			insert: func(tx pgx.Tx, eventID pgtype.UUID) error {
				_, err := tx.Exec(ctx, `INSERT INTO promo_codes(event_id,code,discount_percent)
VALUES($1,$2,10)`, eventID, fmt.Sprintf("EXT%d", time.Now().UnixNano()))
				return err
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			var eventID pgtype.UUID
			if err := tx.QueryRow(ctx, `INSERT INTO events(
organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status,vat_percentage)
VALUES($1,$2,'house','Venue','Bucuresti','social',44,26,clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days',$3,'published',21)
RETURNING id`, fixture.ownerID, "External guard "+test.name, fmt.Sprintf("guard-%s-%d", test.name, time.Now().UnixNano())).Scan(&eventID); err != nil {
				t.Fatal(err)
			}
			if err := test.insert(tx, eventID); err != nil {
				t.Fatal(err)
			}
			if _, err := tx.Exec(ctx, `UPDATE events SET external_ticket_url='https://tickets.example.test/blocked' WHERE id=$1`, eventID); err == nil {
				t.Fatalf("external ticketing accepted existing %s", test.name)
			}
		})
	}
}
