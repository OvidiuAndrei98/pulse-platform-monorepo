package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/outings"
	"pulse-api/internal/tickets"
)

func offlineGiftSnapshot(t *testing.T, pool *pgxpool.Pool, event, owner pgtype.UUID) tickets.OfflineValidationSnapshotResponse {
	t.Helper()
	h := tickets.NewHandler(db.New(pool), pool, "https://test.invalid")
	r := httptest.NewRequest("POST", "/", nil)
	ctx := context.WithValue(r.Context(), auth.UserIDKey, common.UUIDToString(owner))
	route := chi.NewRouteContext()
	route.URLParams.Add("id", common.UUIDToString(event))
	r = r.WithContext(context.WithValue(ctx, chi.RouteCtxKey, route))
	w := httptest.NewRecorder()
	h.HandleCreateOfflineSnapshot(w, r)
	if w.Code != 200 {
		t.Fatalf("snapshot status=%d response=%s", w.Code, w.Body.String())
	}
	var pack tickets.OfflineValidationSnapshotResponse
	if err := json.Unmarshal(w.Body.Bytes(), &pack); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM offline_validation_snapshots WHERE id=$1::uuid`, pack.SnapshotID)
	})
	return pack
}

// A Stripe payment can settle after an organizer has prepared a scanner pack.
// Only tickets actually issued to that pack are frozen; a future credential may
// safely be transferred once, with the existing atomic rotation safeguards.
func TestPaidGiftAfterOfflinePackAcceptsOnlyUnexposedCredential(t *testing.T) {
	for _, packBeforePayment := range []bool{true, false} {
		t.Run(map[bool]string{true: "payment_finishes_after_pack", false: "pack_contains_issued_gift"}[packBeforePayment], func(t *testing.T) {
			pool, h, f, order, intent := seedNativePaymentFixture(t)
			ctx := context.Background()
			var recipient pgtype.UUID
			if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES('Offline gift recipient',gen_random_uuid()::text||'@example.invalid','test','user',true) RETURNING id`).Scan(&recipient); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				_, _ = pool.Exec(ctx, `DELETE FROM ticket_transfers WHERE recipient_id=$1`, recipient)
				_, _ = pool.Exec(ctx, `DELETE FROM outing_ticket_recipients WHERE recipient_id=$1`, recipient)
				_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, recipient)
			})
			if _, err := pool.Exec(ctx, `UPDATE orders SET user_id=$2 WHERE id=$1`, order.ID, f.ownerID); err != nil {
				t.Fatal(err)
			}
			if _, err := pool.Exec(ctx, `INSERT INTO outing_ticket_recipients(order_id,ordinal,decision_round,event_id,recipient_id,recipient_name) VALUES($1,0,0,$2,$3,'Offline gift recipient')`, order.ID, f.eventID, recipient); err != nil {
				t.Fatal(err)
			}
			var pack tickets.OfflineValidationSnapshotResponse
			if packBeforePayment {
				pack = offlineGiftSnapshot(t, pool, f.eventID, f.ownerID)
				if len(pack.Tickets) != 0 {
					t.Fatal("pending payment leaked an entry credential into scanner pack")
				}
			}
			for range 2 {
				if err := h.fulfillPaidOrder(ctx, "", intent.ID, common.UUIDToString(order.ID), f.accountID, true, &intent); err != nil {
					t.Fatal(err)
				}
			}
			if !packBeforePayment {
				pack = offlineGiftSnapshot(t, pool, f.eventID, f.ownerID)
				if len(pack.Tickets) != 2 {
					t.Fatal("completed tickets missing from immutable scanner pack")
				}
			}
			var transferID, oldHash, currentHash string
			var ticketID, holder pgtype.UUID
			var exposed, eventLocked bool
			if err := pool.QueryRow(ctx, `SELECT x.id::text,t.id,t.validation_hash,t.offline_credential_exposed,e.ticket_transfers_locked FROM ticket_transfers x JOIN tickets t ON t.id=x.ticket_id JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=o.event_id WHERE t.order_id=$1`, order.ID).Scan(&transferID, &ticketID, &oldHash, &exposed, &eventLocked); err != nil {
				t.Fatal(err)
			}
			if !eventLocked || exposed == packBeforePayment {
				t.Fatalf("wrong cutoff: event=%v ticket=%v packBefore=%v", eventLocked, exposed, packBeforePayment)
			}
			// The wallet must not keep calling an offline-frozen offer "assigned"
			// while waiting for a separate transfers-screen poll to expire it.
			ticketHandler := tickets.NewHandler(db.New(pool), pool, "https://test.invalid")
			walletRequest := httptest.NewRequest("GET", "/", nil)
			walletRequest = walletRequest.WithContext(context.WithValue(walletRequest.Context(), auth.UserIDKey, common.UUIDToString(f.ownerID)))
			wallet := httptest.NewRecorder()
			ticketHandler.HandleGetUserTickets(wallet, walletRequest)
			var walletTickets []tickets.UserTicketResponse
			if err := json.Unmarshal(wallet.Body.Bytes(), &walletTickets); err != nil || wallet.Code != 200 || len(walletTickets) != 2 {
				t.Fatalf("wallet status=%d response=%s", wallet.Code, wallet.Body.String())
			}
			for _, item := range walletTickets {
				if item.ID == common.UUIDToString(ticketID) && (item.AssignedRecipientID != "") != packBeforePayment {
					t.Fatal("wallet assignment disagrees with actual transfer eligibility")
				}
			}
			orders := httptest.NewRecorder()
			ticketHandler.HandleGetUserOrders(orders, walletRequest)
			var orderRows []tickets.UserOrderResponse
			if err := json.Unmarshal(orders.Body.Bytes(), &orderRows); err != nil || orders.Code != 200 || len(orderRows) != 1 || len(orderRows[0].TicketRecipients) != 1 {
				t.Fatalf("order recipient projection status=%d response=%s", orders.Code, orders.Body.String())
			}
			wantRecipientStatus := "expired"
			if packBeforePayment {
				wantRecipientStatus = "pending"
			}
			if orderRows[0].TicketRecipients[0].Status != wantRecipientStatus {
				t.Fatalf("order recipient status=%s want=%s", orderRows[0].TicketRecipients[0].Status, wantRecipientStatus)
			}
			check, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			_, checkErr := lockCheckoutRecipients(ctx, check, f.eventID, recipient, 1)
			_ = check.Rollback(ctx)
			if (checkErr != nil) != packBeforePayment {
				t.Fatalf("self-purchase must be blocked only while gift acceptance remains possible: %v", checkErr)
			}
			api := (&outings.Handler{Pool: pool}).Routes()
			accept := func() *httptest.ResponseRecorder {
				r := httptest.NewRequest("POST", "/transfers/"+transferID+"/respond", bytes.NewBufferString(`{"status":"accepted"}`))
				r = r.WithContext(context.WithValue(r.Context(), auth.UserIDKey, common.UUIDToString(recipient)))
				w := httptest.NewRecorder()
				api.ServeHTTP(w, r)
				return w
			}
			w := accept()
			wantStatus := 409
			if packBeforePayment {
				wantStatus = 200
			}
			if w.Code != wantStatus {
				t.Fatalf("accept status=%d want=%d body=%s", w.Code, wantStatus, w.Body.String())
			}
			if err := pool.QueryRow(ctx, `SELECT user_id,validation_hash FROM tickets WHERE id=$1`, ticketID).Scan(&holder, &currentHash); err != nil {
				t.Fatal(err)
			}
			if packBeforePayment {
				if holder != recipient || currentHash == oldHash || accept().Code != 200 {
					t.Fatal("unexposed gift acceptance did not rotate once and replay safely")
				}
				updatedPack := offlineGiftSnapshot(t, pool, f.eventID, f.ownerID)
				found := false
				for _, item := range updatedPack.Tickets {
					if item.TicketID == common.UUIDToString(ticketID) {
						found = item.ValidationHash == currentHash && item.ValidationHash != oldHash
					}
				}
				if !found {
					t.Fatal("later scanner pack did not capture the recipient's current credential")
				}
			} else {
				if holder != f.ownerID || currentHash != oldHash {
					t.Fatal("downloaded QR credential changed after offline pack issuance")
				}
				// Retention cannot reopen exposed credentials, even to an old writer.
				if _, err := pool.Exec(ctx, `DELETE FROM offline_validation_snapshots WHERE id=$1::uuid`, pack.SnapshotID); err != nil {
					t.Fatal(err)
				}
				if _, err := pool.Exec(ctx, `UPDATE tickets SET validation_hash=repeat('a',64) WHERE id=$1`, ticketID); err == nil {
					t.Fatal("raw writer rotated an exposed offline credential")
				}
				if _, err := pool.Exec(ctx, `UPDATE tickets SET offline_credential_exposed=FALSE WHERE id=$1`, ticketID); err == nil {
					t.Fatal("raw writer erased permanent exposure marker")
				}
				r := httptest.NewRequest("GET", "/transfers", nil)
				r = r.WithContext(context.WithValue(r.Context(), auth.UserIDKey, common.UUIDToString(recipient)))
				list := httptest.NewRecorder()
				api.ServeHTTP(list, r)
				var transfers []struct {
					Status        string `json:"status"`
					BlockedReason string `json:"blockedReason"`
				}
				if err := json.Unmarshal(list.Body.Bytes(), &transfers); err != nil || list.Code != 200 || len(transfers) != 1 || transfers[0].Status != "expired" || transfers[0].BlockedReason != "offline_snapshot" {
					t.Fatalf("blocked gift lacks actionable reason: %d %s", list.Code, list.Body.String())
				}
			}
		})
	}
}
