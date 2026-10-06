package payments

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
	"pulse-api/internal/email"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type recordingTicketMailer struct {
	calls atomic.Int32
	fail  bool
}

func (m *recordingTicketMailer) SendTicketConfirmationEmail(context.Context, string, string, string, bool, bool, []email.TicketDelivery) error {
	m.calls.Add(1)
	time.Sleep(40 * time.Millisecond)
	if m.fail {
		return errors.New("SMTP unavailable")
	}
	return nil
}

func TestTicketEmailConcurrentDeliveryAndRetry(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	mailer := &recordingTicketMailer{}
	h := &CheckoutHandler{queries: db.New(pool), db: pool, mailer: mailer}
	orderID, _, err := h.bookFreeTicket(context.Background(), f.eventID, f.buyerID, f.buyerEmail, map[string]int32{common.UUIDToString(f.freeTicketID): 1})
	if err != nil {
		t.Fatal(err)
	}
	if mailer.calls.Load() != 0 {
		t.Fatal("HTTP booking sent email synchronously")
	}
	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := h.deliverTicketConfirmation(orderID); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if mailer.calls.Load() != 1 {
		t.Fatalf("duplicate sends: %d", mailer.calls.Load())
	}
	if _, err := pool.Exec(context.Background(), `UPDATE orders SET ticket_email_sent_at=NULL,ticket_email_next_attempt_at=now()-interval '1 second' WHERE id=$1`, orderID); err != nil {
		t.Fatal(err)
	}
	mailer.fail = true
	if err := h.deliverTicketConfirmation(orderID); err == nil {
		t.Fatal("SMTP failure swallowed")
	}
	if err := h.deliverTicketConfirmation(orderID); err != nil {
		t.Fatal(err)
	}
	if mailer.calls.Load() != 2 {
		t.Fatal("failed email ignored backoff")
	}
	mailer.fail = false
	_, err = pool.Exec(context.Background(), `UPDATE orders SET ticket_email_next_attempt_at=now()-interval '1 second' WHERE id=$1`, orderID)
	if err != nil {
		t.Fatal(err)
	}
	if err := h.deliverTicketConfirmation(orderID); err != nil {
		t.Fatal(err)
	}
	if mailer.calls.Load() != 3 {
		t.Fatal("failed email did not recover")
	}
}

func TestReconciliationClaimsSkipPendingOrdersAndOtherWorkers(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	for i := 0; i < 55; i++ {
		_, err := pool.Exec(ctx, `INSERT INTO orders(event_id,email,status,total_amount,stripe_charge_type,stripe_connected_account_id,stripe_checkout_session_id,created_at)
VALUES($1,$2,'pending',50,'direct','acct_claims',gen_random_uuid()::text,now()-interval '1 minute')`, f.eventID, f.buyerEmail)
		if err != nil {
			t.Fatal(err)
		}
	}
	q := db.New(pool)
	ids := make(chan pgtype.UUID, 55)
	var wg sync.WaitGroup
	for range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				row, err := q.ClaimCheckoutForReconciliation(ctx)
				if errors.Is(err, pgx.ErrNoRows) {
					return
				}
				if err != nil {
					t.Error(err)
					return
				}
				ids <- row.ID
			}
		}()
	}
	wg.Wait()
	close(ids)
	seen := map[pgtype.UUID]bool{}
	for id := range ids {
		if seen[id] {
			t.Fatal("two workers claimed same order")
		}
		seen[id] = true
	}
	if len(seen) != 55 {
		t.Fatalf("only %d orders reached", len(seen))
	}
}

func TestExpiredEmailWorkerCannotCompleteOrReleaseNewClaim(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	q := db.New(pool)
	h := &CheckoutHandler{queries: q, db: pool}
	orderID, _, err := h.bookFreeTicket(ctx, f.eventID, f.buyerID, f.buyerEmail, map[string]int32{common.UUIDToString(f.freeTicketID): 1})
	if err != nil {
		t.Fatal(err)
	}
	oldClaim, err := q.ClaimTicketEmail(ctx, orderID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE orders SET ticket_email_claim_until=now()-interval '1 second', ticket_email_next_attempt_at=now()-interval '1 second' WHERE id=$1`, orderID); err != nil {
		t.Fatal(err)
	}
	newClaim, err := q.ClaimTicketEmail(ctx, orderID)
	if err != nil {
		t.Fatal(err)
	}
	if oldClaim == newClaim {
		t.Fatal("reclaimed delivery retained the old worker token")
	}
	rows, err := q.CompleteTicketEmailClaim(ctx, db.CompleteTicketEmailClaimParams{ID: orderID, TicketEmailClaim: oldClaim})
	if err != nil || rows != 0 {
		t.Fatalf("expired worker completed newer delivery: rows=%d err=%v", rows, err)
	}
	if err := q.ReleaseTicketEmailClaim(ctx, db.ReleaseTicketEmailClaimParams{ID: orderID, TicketEmailClaim: oldClaim}); err != nil {
		t.Fatal(err)
	}
	rows, err = q.CompleteTicketEmailClaim(ctx, db.CompleteTicketEmailClaimParams{ID: orderID, TicketEmailClaim: newClaim})
	if err != nil || rows != 1 {
		t.Fatalf("current worker lost ownership: rows=%d err=%v", rows, err)
	}
}

func TestAuthenticatedBuyersShareVenueIPWithoutSharingReservationCap(t *testing.T) {
	pool := checkoutAbuseTestPool(t)
	ctx := context.Background()
	var eventID pgtype.UUID
	_ = eventID.Scan("874b3b22-ac20-49ed-9464-6d4093a8d7d5")
	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Error(err)
				return
			}
			defer tx.Rollback(ctx)
			var userID pgtype.UUID
			if err := tx.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&userID); err != nil {
				t.Error(err)
				return
			}
			ip := []byte("one-venue-network")
			if err := enforceActiveCheckoutReservationCap(ctx, tx, eventID, userID, "buyer@example.invalid", ip, 1); err != nil {
				t.Error(err)
				return
			}
			if _, err := tx.Exec(ctx, `INSERT INTO orders(event_id,user_id,email,status,reservation_ip_hash) VALUES($1,$2,'buyer@example.invalid','pending',$3)`, eventID, userID, ip); err != nil {
				t.Error(err)
				return
			}
			if err := tx.Commit(ctx); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
}
