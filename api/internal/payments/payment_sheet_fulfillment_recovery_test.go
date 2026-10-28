package payments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"
	"testing"

	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestPaidNativePaymentDatabaseFailureRollsBackAndWorkerRecovers(t *testing.T) {
	for _, boundary := range []string{"second ticket", "purchase notification after completed"} {
		t.Run(boundary, func(t *testing.T) {
			pool, h, f, _, intent := seedNativePaymentFixture(t)
			ctx := context.Background()
			// Attach a purchaser so the final notification and the user's ticket
			// query exercise the same transaction as the two ticket insertions.
			if _, err := pool.Exec(ctx, `UPDATE orders SET user_id=$2,
created_at=clock_timestamp()-interval '1 minute',
checkout_reconcile_after=clock_timestamp()-interval '1 minute' WHERE id=$1`, f.orderID, f.ownerID); err != nil {
				t.Fatal(err)
			}
			var retrieves atomic.Int32
			useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet || r.URL.Path != "/v1/payment_intents/"+intent.ID || r.Header.Get("Stripe-Account") != f.accountID {
					t.Error("recovery must only retrieve the original paid PaymentIntent in its connected account")
					http.Error(w, "unexpected payment operation", http.StatusBadRequest)
					return
				}
				retrieves.Add(1)
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(intent)
			})

			// These order-scoped triggers inject a real PostgreSQL error, not a
			// mocked repository failure. The first boundary proves a partially
			// inserted ticket is rolled back; the second also rolls back completed.
			orderID, eventID := common.UUIDToString(f.orderID), common.UUIDToString(f.eventID)
			name := pgx.Identifier{"test_native_issue_" + strings.ReplaceAll(orderID, "-", "")}.Sanitize()
			table := "tickets"
			fault := fmt.Sprintf(`IF NEW.order_id='%s'::uuid AND EXISTS (SELECT 1 FROM tickets WHERE order_id=NEW.order_id) THEN
  RAISE EXCEPTION 'injected native fulfillment failure' USING ERRCODE='P0001';
END IF;`, orderID)
			if boundary == "purchase notification after completed" {
				table = "notifications"
				fault = fmt.Sprintf(`IF NEW.event_id='%s'::uuid AND NEW.type='ticket_purchased' THEN
  IF (SELECT status::text FROM orders WHERE id='%s'::uuid) <> 'completed'
    OR (SELECT count(*) FROM tickets WHERE order_id='%s'::uuid) <> 2 THEN
    RAISE EXCEPTION 'notification fault reached before ticket issuance and completion';
  END IF;
  RAISE EXCEPTION 'injected native fulfillment failure' USING ERRCODE='P0001';
END IF;`, eventID, orderID, orderID)
			}
			if _, err := pool.Exec(ctx, `CREATE FUNCTION `+name+`() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN `+fault+` RETURN NEW; END; $fault$`); err != nil {
				t.Fatal(err)
			}
			clearFault := func() {
				t.Helper()
				if _, err := pool.Exec(context.Background(), `DROP TRIGGER IF EXISTS `+name+` ON `+table); err != nil {
					t.Error(err)
				}
				if _, err := pool.Exec(context.Background(), `DROP FUNCTION IF EXISTS `+name+`() `); err != nil {
					t.Error(err)
				}
			}
			t.Cleanup(clearFault)
			if _, err := pool.Exec(ctx, `CREATE TRIGGER `+name+` BEFORE INSERT ON `+table+` FOR EACH ROW EXECUTE FUNCTION `+name+`() `); err != nil {
				t.Fatal(err)
			}

			// Stripe has already charged successfully, but its initial success
			// delivery encounters the database fault during fulfillment.
			err := h.reconcileNativePaymentEvent(ctx, intent, f.accountID, true)
			var databaseError *pgconn.PgError
			if !errors.As(err, &databaseError) || databaseError.Code != "P0001" || databaseError.Message != "injected native fulfillment failure" {
				t.Fatalf("expected the injected database failure, got %v", err)
			}
			assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
			assertNotifications := func(want int) {
				t.Helper()
				var count int
				if err := pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE event_id=$1 AND type='ticket_purchased'`, f.eventID).Scan(&count); err != nil {
					t.Fatal(err)
				}
				if count != want {
					t.Fatalf("purchase notifications=%d, want %d", count, want)
				}
			}
			assertNotifications(0)
			if rows, err := h.queries.GetUserTickets(ctx, f.ownerID); err != nil || len(rows) != 0 {
				t.Fatalf("partial tickets became visible before commit: count=%d err=%v", len(rows), err)
			}

			clearFault()
			// The app is closed and Stripe sends no new webhook. Only the existing
			// server worker retries the same paid order after the database recovers.
			h.reconcilePendingPaymentSheets(ctx)
			assertCheckoutRetryState(t, pool, f, "completed", 2, 2, false)
			assertNotifications(1)
			if retrieves.Load() != 1 {
				t.Fatalf("worker retrieved the original intent %d times, want 1", retrieves.Load())
			}
			issued, err := h.queries.GetUserTickets(ctx, f.ownerID)
			if err != nil || len(issued) != 2 {
				t.Fatalf("recovered purchase did not expose both tickets: count=%d err=%v", len(issued), err)
			}
			identities := make(map[string]string, len(issued))
			for _, ticket := range issued {
				if ticket.OrderID != f.orderID || ticket.EventID != f.eventID || ticket.ValidationHash == "" {
					t.Fatal("recovered ticket lost its order, event or QR identity")
				}
				identities[common.UUIDToString(ticket.ID)] = ticket.ValidationHash
			}
			for range 2 {
				if err := h.reconcileNativePaymentEvent(ctx, intent, f.accountID, true); err != nil {
					t.Fatal(err)
				}
				h.reconcilePendingPaymentSheets(ctx)
			}
			assertCheckoutRetryState(t, pool, f, "completed", 2, 2, false)
			assertNotifications(1)
			if retrieves.Load() != 1 {
				t.Fatal("worker kept claiming a completed order")
			}
			replayed, err := h.queries.GetUserTickets(ctx, f.ownerID)
			if err != nil || len(replayed) != len(identities) {
				t.Fatalf("replay changed ticket count: count=%d err=%v", len(replayed), err)
			}
			for _, ticket := range replayed {
				if identities[common.UUIDToString(ticket.ID)] != ticket.ValidationHash {
					t.Fatal("replay replaced a ticket or its QR code")
				}
			}
		})
	}
}
