package outings

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	db "pulse-api/db/generated"
	"pulse-api/internal/payments"
)

func TestGroupEventSupportToggleKeepsIndependentChoices(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	var day string
	if err := f.pool.QueryRow(context.Background(), `SELECT ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date::text FROM events WHERE id=$1`, f.event).Scan(&day); err != nil {
		t.Fatal(err)
	}
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": day, "city": "Bucuresti"})
	path := "/plans/" + p.ID
	// Legacy availability remains stored, without becoming event support or RSVP.
	want(t, f.call("POST", path+"/availability", map[string]any{"date": day, "answer": "yes"}, f.users[1]), 200)
	for _, event := range []string{sid(f.event), sid(f.otherEvent)} {
		want(t, f.call("POST", path+"/proposals", map[string]any{"eventId": event}, f.users[0]), 200)
	}
	before, _ := messagesAs(t, f, g, f.users[1], "")
	var notificationsBefore, ordersBefore int
	if err := f.pool.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM notifications WHERE friend_group_id=$1),(SELECT count(*) FROM orders WHERE user_id=ANY($2))`, g.ID, f.users[:]).Scan(&notificationsBefore, &ordersBefore); err != nil {
		t.Fatal(err)
	}
	for _, actor := range f.users[:2] {
		for _, event := range []string{sid(f.event), sid(f.otherEvent)} {
			p = readAs(t, f, p.ID, actor)
			want(t, f.call("POST", path+"/vote", map[string]any{"eventId": event, "answer": "yes", "revision": p.Revision}, actor), 200)
		}
	}
	p = readAs(t, f, p.ID, f.users[1])
	oldRevision := p.Revision
	want(t, f.call("POST", path+"/vote", map[string]any{"eventId": sid(f.event), "remove": true, "revision": p.Revision}, f.users[1]), 200)
	want(t, f.call("POST", path+"/vote", map[string]any{"eventId": sid(f.otherEvent), "remove": true, "revision": oldRevision}, f.users[1]), 409)
	reconnected := f
	reconnected.handler = &Handler{Pool: f.pool}
	p = readAs(t, reconnected, p.ID, f.users[1])
	for _, option := range p.Options {
		wantCount := 2
		if option.EventID == sid(f.event) {
			wantCount = 1
		}
		if len(option.Reactions) != wantCount {
			t.Fatalf("independent support lost: event=%s count=%d", option.EventID, len(option.Reactions))
		}
	}
	// Repeating removal never reselects the option or removes another member.
	want(t, f.call("POST", path+"/vote", map[string]any{"eventId": sid(f.event), "remove": true, "revision": p.Revision}, f.users[1]), 200)
	want(t, f.call("POST", path+"/vote", map[string]any{"eventId": sid(f.event), "remove": true, "answer": "yes"}, f.users[1]), 400)
	want(t, f.call("POST", path+"/vote", map[string]any{"eventId": sid(f.event), "remove": true}, f.users[2]), 404)
	after, _ := messagesAs(t, f, g, f.users[1], "")
	var notificationsAfter, ordersAfter int
	if err := f.pool.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM notifications WHERE friend_group_id=$1),(SELECT count(*) FROM orders WHERE user_id=ANY($2))`, g.ID, f.users[:]).Scan(&notificationsAfter, &ordersAfter); err != nil {
		t.Fatal(err)
	}
	if len(after) != len(before) || notificationsAfter != notificationsBefore || ordersAfter != ordersBefore {
		t.Fatal("preference toggles produced conversation or purchase side effects")
	}
	want(t, f.call("POST", path+"/choose", map[string]any{"eventId": sid(f.otherEvent)}, f.users[0]), 200)
	p = readAs(t, f, p.ID, f.users[1])
	if member(p, f.users[1]).Attendance != "unanswered" || member(p, f.users[0]).Attendance != "unanswered" {
		t.Fatal("availability or preference converted to attendance")
	}
	for _, answer := range []string{"yes", "no", "yes"} {
		attendanceAs(t, f, p, f.users[1], answer)
		if got := member(readAs(t, reconnected, p.ID, f.users[0]), f.users[1]); got.Attendance != answer {
			t.Fatal("attendance change not shared")
		}
	}
	want(t, f.call("POST", path+"/vote", map[string]any{"eventId": sid(f.otherEvent), "remove": true}, f.users[1]), 409)
}

func TestGroupFreeTicketsForSelfFriendAndExplicitExtra(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	// No external payment provider is configured. This exercises real free
	// registration inventory, gifts, acceptance and recipient safety only.
	mustExec(t, f.pool, `INSERT INTO organizer_profiles(user_id,cui,company_name,fiscal_address,is_verified,verification_status) VALUES($1,$2,'QA only','QA only',TRUE,'approved')`, f.users[2], "QA"+sid(f.users[2])[:12])
	tier := rowID(t, f.pool, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales) VALUES($1,'Free registration',0,8,now()-interval '1 day',now()+interval '1 day') RETURNING id`, f.otherEvent)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.otherEvent)})
	t.Cleanup(func() {
		mustExec(t, f.pool, `DELETE FROM notifications WHERE event_id=$1`, f.otherEvent)
		mustExec(t, f.pool, `DELETE FROM orders WHERE event_id=$1`, f.otherEvent)
		mustExec(t, f.pool, `DELETE FROM ticket_types WHERE id=$1`, tier)
	})
	h := payments.NewCheckoutHandler(db.New(f.pool), f.pool, "", "http://localhost", nil, nil, nil)
	api := chi.NewRouter()
	api.Post("/events/{id}/tickets/book", h.HandleBookFreeTicket)
	book := func(recipient string, extra bool, round int) (int, payments.BookFreeTicketResponse) {
		t.Helper()
		req := request("POST", "/events/"+sid(f.otherEvent)+"/tickets/book", map[string]any{"items": []map[string]any{{"ticketTypeId": sid(tier), "quantity": 1}}, "outing": map[string]any{"planId": p.ID, "decisionRound": round, "recipientIds": []string{recipient}, "extraConfirmed": extra}}, f.users[0])
		req.Header.Set("Idempotency-Key", key(t, f))
		w := httptest.NewRecorder()
		api.ServeHTTP(w, req)
		var response payments.BookFreeTicketResponse
		if w.Code == 200 && json.Unmarshal(w.Body.Bytes(), &response) != nil {
			t.Fatal("invalid booking response")
		}
		return w.Code, response
	}
	if status, _ := book(sid(f.users[0]), false, p.DecisionRound); status != 200 {
		t.Fatalf("own ticket status=%d", status)
	}
	if status, _ := book(sid(f.users[1]), false, p.DecisionRound); status != 200 {
		t.Fatalf("friend-only ticket status=%d", status)
	}
	got := readAs(t, f, p.ID, f.users[1])
	if member(got, f.users[0]).TicketState != "valid" || member(got, f.users[1]).TicketState != "offered" || member(got, f.users[0]).Attendance != "unanswered" || member(got, f.users[1]).Attendance != "unanswered" {
		t.Fatal("issuance changed attendance or treated an offered ticket as ready")
	}
	if status, _ := book(sid(f.users[1]), true, p.DecisionRound); status != 409 {
		t.Fatalf("extra bypassed pending offer status=%d", status)
	}
	var offer string
	if err := f.pool.QueryRow(context.Background(), `SELECT x.id::text FROM ticket_transfers x JOIN tickets t ON t.id=x.ticket_id JOIN orders o ON o.id=t.order_id WHERE o.event_id=$1 AND x.recipient_id=$2`, f.otherEvent, f.users[1]).Scan(&offer); err != nil {
		t.Fatal(err)
	}
	want(t, f.call("POST", "/transfers/"+offer+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 200)
	for _, actor := range f.users[:2] {
		if status, _ := book(sid(actor), false, p.DecisionRound); status != 409 {
			t.Fatalf("extra accepted without consent status=%d", status)
		}
		if status, _ := book(sid(actor), true, p.DecisionRound); status != 200 {
			t.Fatalf("explicit extra refused status=%d", status)
		}
	}
	if status, _ := book(sid(f.users[0]), true, p.DecisionRound+1); status != 409 {
		t.Fatalf("extra bypassed decision round status=%d", status)
	}
	if status, _ := book(sid(f.users[2]), true, p.DecisionRound); status != 409 {
		t.Fatalf("extra bypassed accepted membership status=%d", status)
	}
	var tickets, sold int
	var charged bool
	if err := f.pool.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.event_id=$1),(SELECT tickets_sold FROM ticket_types WHERE id=$2),EXISTS(SELECT 1 FROM orders WHERE event_id=$1 AND (total_amount<>0 OR invoice_requested OR stripe_payment_intent_id IS NOT NULL OR stripe_checkout_session_id IS NOT NULL))`, f.otherEvent, tier).Scan(&tickets, &sold, &charged); err != nil {
		t.Fatal(err)
	}
	if tickets != 4 || sold != 4 || charged {
		t.Fatalf("free inventory/charge mismatch tickets=%d sold=%d charged=%v", tickets, sold, charged)
	}
	got = readAs(t, f, p.ID, f.users[1])
	if member(got, f.users[1]).Attendance != "unanswered" {
		t.Fatal("gift acceptance confirmed attendance")
	}
}

func TestGroupPreferenceAfterReopeningUsesCurrentRevisionAndKeepsOldAttendance(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	path := "/plans/" + p.ID
	want(t, f.call("POST", path+"/proposals", map[string]any{"eventId": sid(f.otherEvent)}, f.users[1]), 200)
	attendanceAs(t, f, p, f.users[1], "yes")
	chosen := readAs(t, f, p.ID, f.users[0])
	want(t, f.call("POST", path+"/reopen", map[string]any{"revision": chosen.Revision, "reason": "other"}, f.users[1]), 404)
	want(t, f.call("POST", path+"/reopen", map[string]any{"revision": chosen.Revision, "reason": "other"}, f.users[0]), 200)
	// The stale UI is rejected, not silently retargeted to another decision round.
	stale := f.call("POST", path+"/vote", map[string]any{"eventId": sid(f.otherEvent), "answer": "yes", "revision": chosen.Revision}, f.users[1])
	want(t, stale, 409)
	var conflict struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(stale.Body.Bytes(), &conflict); err != nil || conflict.Error != "PLAN_CHANGED" {
		t.Fatalf("unexpected stale result: %s", stale.Body.String())
	}
	fresh := readAs(t, f, p.ID, f.users[1])
	if fresh.ChosenEventID != "" || fresh.DecisionRound != chosen.DecisionRound+1 || member(fresh, f.users[1]).Attendance != "unanswered" {
		t.Fatal("reopen copied attendance into a new round")
	}
	want(t, f.call("POST", path+"/vote", map[string]any{"eventId": sid(f.otherEvent), "answer": "yes", "revision": fresh.Revision}, f.users[1]), 200)
	fresh = readAs(t, f, p.ID, f.users[0])
	want(t, f.call("POST", path+"/choose", map[string]any{"eventId": sid(f.otherEvent), "revision": fresh.Revision}, f.users[0]), 200)
	want(t, f.call("POST", path+"/attendance", map[string]any{"answer": "no", "decisionRound": chosen.DecisionRound}, f.users[1]), 409)
	fresh = readAs(t, f, p.ID, f.users[1])
	attendanceAs(t, f, fresh, f.users[1], "no")
	var oldAnswer, newAnswer string
	if err := f.pool.QueryRow(context.Background(), `SELECT (SELECT answer FROM outing_attendance WHERE plan_id=$1 AND user_id=$2 AND decision_round=$3),(SELECT answer FROM outing_attendance WHERE plan_id=$1 AND user_id=$2 AND decision_round=$4)`, p.ID, f.users[1], chosen.DecisionRound, fresh.DecisionRound).Scan(&oldAnswer, &newAnswer); err != nil {
		t.Fatal(err)
	}
	if oldAnswer != "yes" || newAnswer != "no" {
		t.Fatal("old attendance was rewritten or new answer was not persisted")
	}
}
