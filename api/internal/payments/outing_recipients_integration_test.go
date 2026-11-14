package payments

import (
	"bytes"
	"context"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http/httptest"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/outings"
	"sync"
	"testing"
)

// Payment tests create real permanent memberships instead of silently treating
// a legacy event plan as permission to see or spend for a private group.
func attachPermanentPurchaseGroup(t *testing.T, pool *pgxpool.Pool, plan, owner pgtype.UUID) {
	t.Helper()
	ctx := context.Background()
	var group pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO friend_groups(owner_id,name,request_id,request_fingerprint) VALUES($1,'Payment fixture',gen_random_uuid(),'fixture') RETURNING id`, owner).Scan(&group); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE outing_plans SET group_id=$2 WHERE id=$1`, plan, group); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO friend_group_members(group_id,user_id,status,invited_by,joined_at)
 SELECT $2,user_id,status,$3,CURRENT_TIMESTAMP FROM outing_plan_members WHERE plan_id=$1`, plan, group, owner); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE friend_group_id=$1`, group)
		_, _ = pool.Exec(ctx, `DELETE FROM outing_plans WHERE group_id=$1`, group)
		_, _ = pool.Exec(ctx, `DELETE FROM friend_group_members WHERE group_id=$1`, group)
		_, _ = pool.Exec(ctx, `DELETE FROM friend_groups WHERE id=$1`, group)
	})
}

func TestPlanPurchaseSerializesGiftAgainstSelfPurchase(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	var plan pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO outing_plans(owner_id,request_id,title,chosen_event_id,city,outing_date) VALUES($1,gen_random_uuid(),'Private night',$2,'Bucuresti',CURRENT_DATE+1) RETURNING id`, f.buyerID, f.eventID).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO outing_plan_members(plan_id,user_id,status) VALUES($1,$2,'accepted'),($1,$3,'accepted')`, plan, f.buyerID, f.secondBuyerID); err != nil {
		t.Fatal(err)
	}
	attachPermanentPurchaseGroup(t, pool, plan, f.buyerID)
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM outing_plans WHERE id=$1`, plan) })
	h := &CheckoutHandler{queries: db.New(pool), db: pool}
	expected := int64(5400)
	base := context.WithValue(ctx, expectedCheckoutTotalKey{}, &expected)
	selected := context.WithValue(base, outingPurchaseKey{}, &OutingRecipientsRequest{PlanID: common.UUIDToString(plan), DecisionRound: 1, RecipientIDs: []string{common.UUIDToString(f.secondBuyerID)}})
	start := make(chan struct{})
	results := make(chan error, 2)
	var group sync.WaitGroup
	for _, gift := range []bool{true, false} {
		group.Add(1)
		go func(gift bool) {
			defer group.Done()
			<-start
			run, buyer, email := base, f.secondBuyerID, f.secondBuyerEmail
			if gift {
				run, buyer, email = selected, f.buyerID, f.buyerEmail
			}
			_, _, _, _, _, _, err := h.reserveOrder(run, f.eventID, buyer, email, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Name: "Test", Address: "Test", City: "Bucuresti", Country: "RO"})
			results <- err
		}(gift)
	}
	close(start)
	group.Wait()
	close(results)
	success := 0
	for err := range results {
		if err == nil {
			success++
		} else if err.Error() != "OUTING_RECIPIENTS_CHANGED" {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatalf("expected one purchase, got %d", success)
	}
	var orders int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM orders WHERE event_id=$1`, f.eventID).Scan(&orders); err != nil {
		t.Fatal(err)
	}
	if orders != 1 {
		t.Fatal("duplicate reservation")
	}
}

func TestPaidGiftIsIssuedOnceAndUsesExistingTransferAcceptance(t *testing.T) {
	pool, h, f, order, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	var recipient pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES('Gift recipient',gen_random_uuid()::text||'@example.invalid','test','user',true) RETURNING id`).Scan(&recipient); err != nil {
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
	if _, err := pool.Exec(ctx, `INSERT INTO outing_ticket_recipients(order_id,ordinal,plan_id,decision_round,event_id,recipient_id,recipient_name) VALUES($1,0,gen_random_uuid(),1,$2,$3,'Gift recipient')`, order.ID, f.eventID, recipient); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := h.fulfillPaidOrder(ctx, "", intent.ID, common.UUIDToString(order.ID), f.accountID, true, &intent); err != nil {
			t.Fatal(err)
		}
	}
	var offers, tickets int
	var holder pgtype.UUID
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM ticket_transfers x JOIN tickets t ON t.id=x.ticket_id WHERE t.order_id=$1 AND x.recipient_id=$2`, order.ID, recipient).Scan(&offers); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets WHERE order_id=$1`, order.ID).Scan(&tickets); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT t.user_id FROM outing_ticket_recipients a JOIN tickets t ON t.id=a.ticket_id WHERE a.order_id=$1`, order.ID).Scan(&holder); err != nil {
		t.Fatal(err)
	}
	if offers != 1 || tickets != 2 || holder != f.ownerID {
		t.Fatalf("gift duplicated or assigned before acceptance: offers=%d tickets=%d", offers, tickets)
	}
	// A plan gift is bound to the selected account, including an email change.
	var transferID, oldHash, newHash string
	if err := pool.QueryRow(ctx, `SELECT x.id::text,t.validation_hash FROM ticket_transfers x JOIN tickets t ON t.id=x.ticket_id WHERE t.order_id=$1`, order.ID).Scan(&transferID, &oldHash); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET email=gen_random_uuid()::text||'@example.invalid' WHERE id=$1`, recipient); err != nil {
		t.Fatal(err)
	}
	api := (&outings.Handler{Pool: pool}).Routes()
	for range 2 {
		req := httptest.NewRequest("POST", "/transfers/"+transferID+"/respond", bytes.NewBufferString(`{"status":"accepted"}`))
		req = req.WithContext(context.WithValue(req.Context(), auth.UserIDKey, common.UUIDToString(recipient)))
		w := httptest.NewRecorder()
		api.ServeHTTP(w, req)
		if w.Code != 200 {
			t.Fatalf("gift acceptance: %d %s", w.Code, w.Body.String())
		}
	}
	if err := pool.QueryRow(ctx, `SELECT t.user_id,t.validation_hash FROM outing_ticket_recipients a JOIN tickets t ON t.id=a.ticket_id WHERE a.order_id=$1`, order.ID).Scan(&holder, &newHash); err != nil {
		t.Fatal(err)
	}
	if holder != recipient || newHash == oldHash {
		t.Fatal("gift acceptance did not rotate the sole credential")
	}
}

func TestRetryableStripeFailureKeepsRecipientUntilVerifiedClosure(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	var plan, old pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO outing_plans(owner_id,request_id,title,chosen_event_id,city,outing_date) VALUES($1,gen_random_uuid(),'Retry night',$2,'Bucuresti',CURRENT_DATE+1) RETURNING id`, f.buyerID, f.eventID).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO outing_plan_members(plan_id,user_id,status) VALUES($1,$2,'accepted'),($1,$3,'accepted')`, plan, f.buyerID, f.secondBuyerID); err != nil {
		t.Fatal(err)
	}
	attachPermanentPurchaseGroup(t, pool, plan, f.buyerID)
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM outing_plans WHERE id=$1`, plan) })
	if err := pool.QueryRow(ctx, `INSERT INTO orders(user_id,event_id,email,status,total_amount,stripe_payment_intent_id) VALUES($1,$2,$3,'failed',50,'pi_fixture_retry') RETURNING id`, f.secondBuyerID, f.eventID, f.secondBuyerEmail).Scan(&old); err != nil {
		t.Fatal(err)
	}
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	expected := int64(5400)
	run := context.WithValue(ctx, expectedCheckoutTotalKey{}, &expected)
	run = context.WithValue(run, outingPurchaseKey{}, &OutingRecipientsRequest{PlanID: common.UUIDToString(plan), DecisionRound: 1, RecipientIDs: []string{common.UUIDToString(f.secondBuyerID)}})
	reserve := func() error {
		_, _, _, _, _, _, err := h.reserveOrder(run, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Name: "Test", Address: "Test", City: "Bucuresti", Country: "RO"})
		return err
	}
	if err := reserve(); err == nil || err.Error() != "OUTING_RECIPIENTS_CHANGED" {
		t.Fatalf("retryable provider session released its recipient: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO checkout_closed_payments(order_id) VALUES($1)`, old); err != nil {
		t.Fatal(err)
	}
	if err := reserve(); err != nil {
		t.Fatal(err)
	}
}

func TestTwoPlanMembersCannotBothBuyForTheSameFriend(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	var recipient, plan pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES('Third friend',gen_random_uuid()::text||'@example.invalid','test','user',true) RETURNING id`).Scan(&recipient); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, recipient) })
	if err := pool.QueryRow(ctx, `INSERT INTO outing_plans(owner_id,request_id,title,chosen_event_id,city,outing_date) VALUES($1,gen_random_uuid(),'Together',$2,'Bucuresti',CURRENT_DATE+1) RETURNING id`, f.buyerID, f.eventID).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM outing_plans WHERE id=$1`, plan) })
	if _, err := pool.Exec(ctx, `INSERT INTO outing_plan_members(plan_id,user_id,status) SELECT $1,u,'accepted' FROM unnest($2::uuid[]) u`, plan, []pgtype.UUID{f.buyerID, f.secondBuyerID, recipient}); err != nil {
		t.Fatal(err)
	}
	attachPermanentPurchaseGroup(t, pool, plan, f.buyerID)
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	expected := int64(5400)
	run := context.WithValue(ctx, expectedCheckoutTotalKey{}, &expected)
	run = context.WithValue(run, outingPurchaseKey{}, &OutingRecipientsRequest{PlanID: common.UUIDToString(plan), DecisionRound: 1, RecipientIDs: []string{common.UUIDToString(recipient)}})
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, buyer := range []pgtype.UUID{f.buyerID, f.secondBuyerID} {
		go func(buyer pgtype.UUID) {
			<-start
			_, _, _, _, _, _, err := h.reserveOrder(run, f.eventID, buyer, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Name: "Test", Address: "Test", City: "Bucuresti", Country: "RO"})
			results <- err
		}(buyer)
	}
	close(start)
	success := 0
	for range 2 {
		err := <-results
		if err == nil {
			success++
		} else if err.Error() != "OUTING_RECIPIENTS_CHANGED" {
			t.Fatal(err)
		}
	}
	if success != 1 {
		t.Fatalf("two buyers reserved the same recipient: %d", success)
	}
}

func TestGiftRequiresAcceptedMembershipCurrentDestinationAndTransferableEvent(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	var plan pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO outing_plans(owner_id,request_id,title,chosen_event_id,city,outing_date) VALUES($1,gen_random_uuid(),'Rules',$2,'Bucuresti',CURRENT_DATE+1) RETURNING id`, f.buyerID, f.eventID).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM outing_plans WHERE id=$1`, plan) })
	if _, err := pool.Exec(ctx, `INSERT INTO outing_plan_members(plan_id,user_id,status) VALUES($1,$2,'accepted'),($1,$3,'pending')`, plan, f.buyerID, f.secondBuyerID); err != nil {
		t.Fatal(err)
	}
	attachPermanentPurchaseGroup(t, pool, plan, f.buyerID)
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	expected := int64(5400)
	selection := &OutingRecipientsRequest{PlanID: common.UUIDToString(plan), DecisionRound: 1, RecipientIDs: []string{common.UUIDToString(f.secondBuyerID)}}
	run := context.WithValue(context.WithValue(ctx, expectedCheckoutTotalKey{}, &expected), outingPurchaseKey{}, selection)
	rejected := func(code string) {
		t.Helper()
		_, _, _, _, _, _, err := h.reserveOrder(run, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Name: "Test", Address: "Test", City: "Bucuresti", Country: "RO"})
		if err == nil || err.Error() != code {
			t.Fatalf("unsafe gift selection: %v", err)
		}
	}
	rejected("OUTING_RECIPIENTS_CHANGED")
	if _, err := pool.Exec(ctx, `UPDATE outing_plan_members SET status='accepted' WHERE plan_id=$1 AND user_id=$2`, plan, f.secondBuyerID); err != nil {
		t.Fatal(err)
	}
	// A stale accepted outing row cannot bypass the group's pending membership.
	rejected("OUTING_RECIPIENTS_CHANGED")
	if _, err := pool.Exec(ctx, `UPDATE friend_group_members SET status='accepted' WHERE group_id=(SELECT group_id FROM outing_plans WHERE id=$1) AND user_id=$2`, plan, f.secondBuyerID); err != nil {
		t.Fatal(err)
	}
	selection.DecisionRound = 2
	rejected("OUTING_RECIPIENTS_CHANGED")
	selection.DecisionRound = 1
	if _, err := pool.Exec(ctx, `UPDATE events SET ticket_transfers_locked=true WHERE id=$1`, f.eventID); err != nil {
		t.Fatal(err)
	}
	rejected("TICKET_GIFT_WINDOW_CLOSED")
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM orders WHERE event_id=$1`, f.eventID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rejected selection created orders: %d %v", count, err)
	}
}
