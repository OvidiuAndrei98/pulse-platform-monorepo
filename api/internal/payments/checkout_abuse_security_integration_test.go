package payments

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "pulse-api/db/generated"
)

func checkoutAbuseTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("ABUSE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set ABUSE_TEST_DATABASE_URL to a local spottr_security_test database")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal("invalid checkout abuse test database config")
	}
	if config.ConnConfig.Host != "127.0.0.1" || config.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated test database")
	}
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	schema := "checkout_abuse_" + hex.EncodeToString(random)
	admin, err := pgxpool.NewWithConfig(context.Background(), config.Copy())
	if err != nil {
		t.Fatal(err)
	}
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(context.Background(), "CREATE SCHEMA "+identifier); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+identifier+" CASCADE")
		admin.Close()
	})
	config.ConnConfig.RuntimeParams["search_path"] = schema
	config.MaxConns = 12
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(context.Background(), `
CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL,
    user_id uuid, email text NOT NULL, status text NOT NULL,
	reservation_ip_hash bytea,
	stripe_checkout_session_id text, stripe_connected_account_id text,
	stripe_charge_type text,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE order_items (order_id uuid NOT NULL, quantity integer NOT NULL);
CREATE TABLE checkout_reservation_reviews (
	order_id uuid PRIMARY KEY, reason varchar(64) NOT NULL,
	detected_at timestamptz NOT NULL DEFAULT clock_timestamp(), resolved_at timestamptz
);`); err != nil {
		t.Fatal(err)
	}
	return pool
}

func TestStaleReviewBatchesDoNotStarveOrdersAfterFirstFifty(t *testing.T) {
	pool := checkoutAbuseTestPool(t)
	ctx := context.Background()
	var eventID pgtype.UUID
	if err := eventID.Scan("d522b1df-f624-44d2-840c-96144974bd99"); err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 55; index++ {
		if _, err := pool.Exec(ctx, `INSERT INTO orders(event_id,email,status,stripe_connected_account_id,stripe_charge_type,created_at)
VALUES($1,$2,'pending','acct_batch_security','direct',clock_timestamp()-interval '100 years')`, eventID, fmt.Sprintf("batch-%d@example.invalid", index)); err != nil {
			t.Fatal(err)
		}
	}
	queries := db.New(pool)
	first, err := queries.MarkStaleSessionlessCheckoutReservationsForReview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	second, err := queries.MarkStaleSessionlessCheckoutReservationsForReview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	third, err := queries.MarkStaleSessionlessCheckoutReservationsForReview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if first != 50 || second != 5 || third != 0 {
		t.Fatalf("review batches = %d/%d/%d, want 50/5/0", first, second, third)
	}
}

func TestStaleSessionlessReservationIsQuarantinedWithoutReleasingInventory(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	var ownerID, eventID, ticketTypeID, staleOrderID, youngOrderID, attachedOrderID pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active)
VALUES($1,$2,'not-used','organizer',TRUE) RETURNING id`, fmt.Sprintf("stale-owner-%d", suffix), fmt.Sprintf("stale-owner-%d@example.invalid", suffix)).Scan(&ownerID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status)
VALUES($1,'Stale checkout','house','Venue','Bucuresti','social',44,26,clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days',$2,'published') RETURNING id`, ownerID, fmt.Sprintf("stale-place-%d", suffix)).Scan(&eventID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,tickets_sold,start_sales,end_sales)
VALUES($1,'General',10,20,6,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day') RETURNING id`, eventID).Scan(&ticketTypeID); err != nil {
		t.Fatal(err)
	}
	insertOrder := func(createdAt string, session any, destination *pgtype.UUID) {
		t.Helper()
		if err := pool.QueryRow(ctx, `INSERT INTO orders(event_id,email,status,total_amount,stripe_connected_account_id,stripe_charge_type,stripe_checkout_session_id,created_at)
VALUES($1,$2,'pending',20,'acct_stale_security','direct',$3,clock_timestamp()+$4::interval) RETURNING id`, eventID, fmt.Sprintf("buyer-%d@example.invalid", suffix), session, createdAt).Scan(destination); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES($1,$2,2,10)`, *destination, ticketTypeID); err != nil {
			t.Fatal(err)
		}
	}
	insertOrder("-100 years", nil, &staleOrderID)
	insertOrder("-5 minutes", nil, &youngOrderID)
	insertOrder("-100 years", fmt.Sprintf("cs_stale_security_%d", suffix), &attachedOrderID)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), "DELETE FROM orders WHERE id=$1 OR id=$2 OR id=$3", staleOrderID, youngOrderID, attachedOrderID)
		_, _ = pool.Exec(context.Background(), "DELETE FROM ticket_types WHERE id=$1", ticketTypeID)
		_, _ = pool.Exec(context.Background(), "DELETE FROM events WHERE id=$1", eventID)
		_, _ = pool.Exec(context.Background(), "DELETE FROM users WHERE id=$1", ownerID)
	})

	queries := db.New(pool)
	marked, err := queries.MarkStaleSessionlessCheckoutReservationsForReview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if marked != 1 {
		t.Fatalf("marked reviews = %d, want 1", marked)
	}
	markedAgain, err := queries.MarkStaleSessionlessCheckoutReservationsForReview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if markedAgain != 0 {
		t.Fatalf("second review marking changed %d rows, want 0", markedAgain)
	}
	handler := &CheckoutHandler{queries: queries, db: pool}
	if err := handler.FulfillCheckout(ctx, "cs_forged_metadata_only", "pi_forged_metadata_only", staleOrderID.String(), "acct_stale_security", true); err != nil {
		t.Fatal(err)
	}
	var reviewedOrderID pgtype.UUID
	if err := pool.QueryRow(ctx, `SELECT order_id FROM checkout_reservation_reviews WHERE resolved_at IS NULL`).Scan(&reviewedOrderID); err != nil {
		t.Fatal(err)
	}
	if reviewedOrderID != staleOrderID {
		t.Fatalf("reviewed order = %s, want stale order", reviewedOrderID.String())
	}
	var status string
	var ticketsSold int32
	if err := pool.QueryRow(ctx, `SELECT o.status::text,tt.tickets_sold FROM orders o JOIN ticket_types tt ON tt.event_id=o.event_id WHERE o.id=$1 AND tt.id=$2`, staleOrderID, ticketTypeID).Scan(&status, &ticketsSold); err != nil {
		t.Fatal(err)
	}
	if status != "pending" || ticketsSold != 6 {
		t.Fatalf("status=%s tickets_sold=%d, want pending/6 while external outcome is unknown", status, ticketsSold)
	}
	var issuedTickets int64
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM tickets WHERE order_id=$1`, staleOrderID).Scan(&issuedTickets); err != nil {
		t.Fatal(err)
	}
	if issuedTickets != 0 {
		t.Fatalf("issued tickets = %d, want 0 for an unbound Stripe Session", issuedTickets)
	}
}

func TestConcurrentGuestReservationsCannotExceedTicketCap(t *testing.T) {
	pool := checkoutAbuseTestPool(t)
	var eventID pgtype.UUID
	if err := eventID.Scan("3bb8a31e-eb30-4b81-a293-bbf94250f642"); err != nil {
		t.Fatal(err)
	}
	var accepted atomic.Int32
	var rejected atomic.Int32
	var failures atomic.Int32
	var wait sync.WaitGroup
	for attempt := 0; attempt < 6; attempt++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			tx, err := pool.Begin(context.Background())
			if err != nil {
				failures.Add(1)
				return
			}
			defer tx.Rollback(context.Background())
			email := "Buyer@Example.Invalid"
			if index%2 == 1 {
				email = "buyer@example.invalid"
			}
			if err := enforceActiveCheckoutReservationCap(context.Background(), tx, eventID, pgtype.UUID{}, email, nil, 8); err != nil {
				if errors.Is(err, errTooManyActiveCheckoutReservations) {
					rejected.Add(1)
					return
				}
				failures.Add(1)
				return
			}
			var orderID pgtype.UUID
			if err := tx.QueryRow(context.Background(), `INSERT INTO orders(event_id,email,status) VALUES($1,$2,'pending') RETURNING id`, eventID, email).Scan(&orderID); err != nil {
				failures.Add(1)
				return
			}
			if _, err := tx.Exec(context.Background(), `INSERT INTO order_items(order_id,quantity) VALUES($1,8)`, orderID); err != nil {
				failures.Add(1)
				return
			}
			if err := tx.Commit(context.Background()); err != nil {
				failures.Add(1)
				return
			}
			accepted.Add(1)
		}(attempt)
	}
	wait.Wait()
	if failures.Load() != 0 {
		t.Fatalf("unexpected failures = %d", failures.Load())
	}
	if accepted.Load() != 2 || rejected.Load() != 4 {
		t.Fatalf("accepted=%d rejected=%d, want 2/4", accepted.Load(), rejected.Load())
	}
	var orders, tickets int64
	if err := pool.QueryRow(context.Background(), `SELECT COUNT(DISTINCT o.id),COALESCE(SUM(oi.quantity),0) FROM orders o JOIN order_items oi ON oi.order_id=o.id`).Scan(&orders, &tickets); err != nil {
		t.Fatal(err)
	}
	if orders != 2 || tickets != maxActiveReservedTickets {
		t.Fatalf("persisted orders=%d tickets=%d", orders, tickets)
	}
}

func TestOldPendingReservationStillConsumesActiveCap(t *testing.T) {
	pool := checkoutAbuseTestPool(t)
	ctx := context.Background()
	var eventID pgtype.UUID
	if err := eventID.Scan("d6535ef0-d7bc-46ce-b5fc-1761f7133ab2"); err != nil {
		t.Fatal(err)
	}
	email := "held-stock@example.invalid"
	for index := 0; index < 2; index++ {
		var orderID pgtype.UUID
		if err := pool.QueryRow(ctx, `INSERT INTO orders(event_id,email,status,created_at) VALUES($1,$2,'pending',clock_timestamp()-interval '100 years') RETURNING id`, eventID, email).Scan(&orderID); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO order_items(order_id,quantity) VALUES($1,8)`, orderID); err != nil {
			t.Fatal(err)
		}
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err := enforceActiveCheckoutReservationCap(ctx, tx, eventID, pgtype.UUID{}, email, nil, 1); !errors.Is(err, errTooManyActiveCheckoutReservations) {
		t.Fatalf("old pending inventory cap error = %v, want too many reservations", err)
	}
}

func TestConcurrentGuestReservationsCannotBypassCapByRotatingEmail(t *testing.T) {
	pool := checkoutAbuseTestPool(t)
	var eventID pgtype.UUID
	if err := eventID.Scan("5b5d9d62-6f40-4e32-9ae4-f32db16797a7"); err != nil {
		t.Fatal(err)
	}
	reservationIPHash := []byte("shared-ip-hmac-digest-32-bytes!!")
	var accepted atomic.Int32
	var rejected atomic.Int32
	var failures atomic.Int32
	var wait sync.WaitGroup
	for attempt := 0; attempt < maxActiveReservedTicketsPerIP/8+2; attempt++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			tx, err := pool.Begin(context.Background())
			if err != nil {
				failures.Add(1)
				return
			}
			defer tx.Rollback(context.Background())
			email := fmt.Sprintf("rotated-%d@example.invalid", index)
			if err := enforceActiveCheckoutReservationCap(context.Background(), tx, eventID, pgtype.UUID{}, email, reservationIPHash, 8); err != nil {
				if errors.Is(err, errTooManyActiveCheckoutReservations) {
					rejected.Add(1)
					return
				}
				failures.Add(1)
				return
			}
			var orderID pgtype.UUID
			if err := tx.QueryRow(context.Background(), `INSERT INTO orders(event_id,email,status,reservation_ip_hash) VALUES($1,$2,'pending',$3) RETURNING id`, eventID, email, reservationIPHash).Scan(&orderID); err != nil {
				failures.Add(1)
				return
			}
			if _, err := tx.Exec(context.Background(), `INSERT INTO order_items(order_id,quantity) VALUES($1,8)`, orderID); err != nil {
				failures.Add(1)
				return
			}
			if err := tx.Commit(context.Background()); err != nil {
				failures.Add(1)
				return
			}
			accepted.Add(1)
		}(attempt)
	}
	wait.Wait()
	if failures.Load() != 0 {
		t.Fatalf("unexpected failures = %d", failures.Load())
	}
	if accepted.Load() != maxActiveReservedTicketsPerIP/8 || rejected.Load() != 2 {
		t.Fatalf("accepted=%d rejected=%d, want guest ticket cap and two rejections", accepted.Load(), rejected.Load())
	}
}
