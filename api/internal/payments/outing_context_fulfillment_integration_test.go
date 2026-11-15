package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/outings"
)

// A social edit must not retarget an already prepared payment. The immutable
// purchase snapshot, not the group's current destination, decides fulfillment.
func TestPendingGiftFulfillsOriginalEventAfterActualOutingContextEdit(t *testing.T) {
	pool, h, f, order, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	var buyer, recipient, plan pgtype.UUID
	for _, target := range []*pgtype.UUID{&buyer, &recipient} {
		if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES('ctx-payment-'||gen_random_uuid()::text,gen_random_uuid()::text||'@example.invalid','test','user',true) RETURNING id`).Scan(target); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM notifications WHERE user_id=ANY($1::uuid[])`, []pgtype.UUID{buyer, recipient})
		_, _ = pool.Exec(ctx, `DELETE FROM ticket_transfers WHERE sender_id=$1 OR recipient_id=$2`, buyer, recipient)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=ANY($1::uuid[])`, []pgtype.UUID{buyer, recipient})
	})
	if _, err := pool.Exec(ctx, `UPDATE orders SET user_id=$2 WHERE id=$1`, order.ID, buyer); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO outing_plans(owner_id,request_id,title,chosen_event_id,city,outing_date,expires_at)
 SELECT $1,gen_random_uuid(),'Context payment review',e.id,e.city,((e.start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date,e.end_time FROM events e WHERE e.id=$2 RETURNING id`, buyer, f.eventID).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO outing_plan_members(plan_id,user_id,status) VALUES($1,$2,'accepted'),($1,$3,'accepted')`, plan, buyer, recipient); err != nil {
		t.Fatal(err)
	}
	attachPermanentPurchaseGroup(t, pool, plan, buyer)
	if _, err := pool.Exec(ctx, `INSERT INTO outing_plan_options(plan_id,event_id,position,proposed_by) VALUES($1,$2,0,$3)`, plan, f.eventID, buyer); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO outing_plan_dates(plan_id,outing_date) SELECT id,outing_date FROM outing_plans WHERE id=$1`, plan); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO outing_plan_decisions(plan_id,round,event_id) VALUES($1,1,$2)`, plan, f.eventID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO outing_ticket_recipients(order_id,ordinal,plan_id,decision_round,event_id,recipient_id,recipient_name)
 VALUES($1,0,$2,1,$3,$4,'Gift recipient'),($1,1,$2,1,$3,$5,'Buyer')`, order.ID, plan, f.eventID, recipient, buyer); err != nil {
		t.Fatal(err)
	}
	var before, after, targetDay string
	var revision int64
	if err := pool.QueryRow(ctx, `SELECT to_jsonb(o)::text FROM orders o WHERE id=$1`, order.ID).Scan(&before); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT revision,(outing_date+1)::text FROM outing_plans WHERE id=$1`, plan).Scan(&revision, &targetDay); err != nil {
		t.Fatal(err)
	}
	payload, _ := json.Marshal(map[string]any{"revision": revision, "date": targetDay, "city": "Bucuresti", "confirmImpact": true})
	r := httptest.NewRequest("POST", "/plans/"+common.UUIDToString(plan)+"/context", bytes.NewReader(payload))
	r = r.WithContext(context.WithValue(r.Context(), auth.UserIDKey, common.UUIDToString(buyer)))
	w := httptest.NewRecorder()
	(&outings.Handler{Pool: pool}).Routes().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("context edit status=%d response=%s", w.Code, w.Body.String())
	}
	var changed struct {
		ID            string `json:"id"`
		ChosenEventID string `json:"chosenEventId"`
		DecisionRound int    `json:"decisionRound"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &changed); err != nil || changed.ID != common.UUIDToString(plan) || changed.ChosenEventID != "" || changed.DecisionRound != 2 {
		t.Fatalf("social context was not corrected in place: %s", w.Body.String())
	}
	if err := pool.QueryRow(ctx, `SELECT to_jsonb(o)::text FROM orders o WHERE id=$1`, order.ID).Scan(&after); err != nil || after != before {
		t.Fatalf("editing an outing changed its prepared order: %v", err)
	}
	var tickets int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets WHERE order_id=$1`, order.ID).Scan(&tickets); err != nil || tickets != 0 {
		t.Fatalf("editing a social context issued unpaid tickets: %d %v", tickets, err)
	}
	for range 2 {
		if err := h.fulfillPaidOrder(ctx, "", intent.ID, common.UUIDToString(order.ID), f.accountID, true, &intent); err != nil {
			t.Fatal(err)
		}
	}
	var snapshots, offers, originalEventTickets int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM outing_ticket_recipients WHERE order_id=$1 AND plan_id=$2 AND decision_round=1 AND event_id=$3 AND ticket_id IS NOT NULL`, order.ID, plan, f.eventID).Scan(&snapshots); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM ticket_transfers x JOIN outing_ticket_recipients a ON a.ticket_id=x.ticket_id WHERE a.order_id=$1 AND x.recipient_id=$2 AND x.sender_id=$3 AND x.status='pending'`, order.ID, recipient, buyer).Scan(&offers); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM tickets t JOIN ticket_types tt ON tt.id=t.ticket_type_id WHERE t.order_id=$1 AND tt.event_id=$2 AND t.user_id=$3`, order.ID, f.eventID, buyer).Scan(&originalEventTickets); err != nil {
		t.Fatal(err)
	}
	if snapshots != 2 || offers != 1 || originalEventTickets != 2 {
		t.Fatalf("context edit retargeted or duplicated fulfillment: snapshots=%d offers=%d original tickets=%d", snapshots, offers, originalEventTickets)
	}
}
