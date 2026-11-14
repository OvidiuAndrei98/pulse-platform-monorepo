package outings

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
)

func readAs(t *testing.T, f fixture, id string, actor pgtype.UUID) plan {
	t.Helper()
	w := f.call("GET", "/plans/"+id, nil, actor)
	want(t, w, 200)
	var p plan
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}
func makeGroup(t *testing.T, f fixture, accept bool) friendGroup {
	t.Helper()
	w := f.call("POST", "/groups", map[string]any{"name": "Our nights", "requestId": key(t, f), "friendIds": []string{sid(f.users[1])}}, f.users[0])
	want(t, w, 201)
	var g friendGroup
	if err := json.Unmarshal(w.Body.Bytes(), &g); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx := context.Background()
		for _, sql := range []string{`DELETE FROM notifications WHERE friend_group_id=$1`, `DELETE FROM friend_group_messages WHERE group_id=$1`, `DELETE FROM outing_attendance WHERE plan_id IN(SELECT id FROM outing_plans WHERE group_id=$1)`, `DELETE FROM outing_plans WHERE group_id=$1`, `DELETE FROM friend_group_members WHERE group_id=$1`, `DELETE FROM friend_groups WHERE id=$1`} {
			mustExec(t, f.pool, sql, g.ID)
		}
		_ = ctx
	})
	if accept {
		want(t, f.call("POST", "/groups/"+g.ID+"/actions", map[string]string{"action": "accept"}, f.users[1]), 200)
	}
	return g
}
func createOuting(t *testing.T, f fixture, g friendGroup, actor pgtype.UUID, draft map[string]any) plan {
	t.Helper()
	if draft["requestId"] == nil {
		draft["requestId"] = key(t, f)
	}
	w := f.call("POST", "/groups/"+g.ID+"/outings", draft, actor)
	want(t, w, 201)
	var p plan
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}
func groupAs(t *testing.T, f fixture, g friendGroup, actor pgtype.UUID) friendGroup {
	t.Helper()
	w := f.call("GET", "/groups/"+g.ID, nil, actor)
	want(t, w, 200)
	var got friendGroup
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	return got
}
func messagesAs(t *testing.T, f fixture, g friendGroup, actor pgtype.UUID, suffix string) ([]groupMessage, bool) {
	t.Helper()
	w := f.call("GET", "/groups/"+g.ID+"/messages"+suffix, nil, actor)
	want(t, w, 200)
	var got struct {
		Items []groupMessage `json:"items"`
		More  bool           `json:"hasMore"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	return got.Items, got.More
}
func member(p plan, id pgtype.UUID) planMember {
	for _, m := range p.Members {
		if m.UserID == sid(id) {
			return m
		}
	}
	return planMember{}
}
func attendanceAs(t *testing.T, f fixture, p plan, actor pgtype.UUID, answer string) {
	t.Helper()
	want(t, f.call("POST", "/plans/"+p.ID+"/attendance", map[string]any{"answer": answer, "decisionRound": p.DecisionRound}, actor), 200)
}

func TestPermanentGroupPrivacyAcceptanceAndHistoryBoundary(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, false)
	path := "/groups/" + g.ID
	invite := groupAs(t, f, g, f.users[1])
	if invite.Status != "pending" || len(invite.Outings) != 0 || invite.Preview != "" || invite.Unread != 0 || len(invite.Members) != 2 {
		t.Fatal("invitation exposesprivatecontext", invite)
	}
	want(t, f.call("GET", path+"/messages", nil, f.users[1]), 404)
	want(t, f.call("POST", path+"/messages", map[string]string{"requestId": key(t, f), "content": "not accepted"}, f.users[1]), 404)
	want(t, f.call("POST", path+"/messages", map[string]string{"requestId": key(t, f), "content": "before acceptance"}, f.users[0]), 201)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	if invitation := groupAs(t, f, g, f.users[1]); invitation.LastSeq != 0 || invitation.Unread != 0 || invitation.Preview != "" {
		t.Fatal("pending invitation leaks conversation metadata")
	}
	want(t, f.call("GET", "/plans/"+p.ID, nil, f.users[1]), 404)
	want(t, f.call("POST", path+"/actions", map[string]string{"action": "accept"}, f.users[1]), 200)
	msgs, _ := messagesAs(t, f, g, f.users[1], "")
	if len(msgs) != 0 {
		t.Fatal("preacceptance history leaked")
	}
	got := groupAs(t, f, g, f.users[1])
	if len(got.Outings) != 1 || member(got.Outings[0], f.users[1]).Attendance != "unanswered" {
		t.Fatal("acceptance mustshowcurrentsnapshot withoutattendance")
	}
	want(t, f.call("POST", path+"/messages", map[string]string{"requestId": key(t, f), "content": "after acceptance"}, f.users[0]), 201)
	msgs, _ = messagesAs(t, f, g, f.users[1], "")
	if len(msgs) != 1 || msgs[0].Content != "after acceptance" {
		t.Fatal("message history boundary incorrect")
	}
	var roomCount int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM event_safety_groups WHERE event_id=$1`, f.event).Scan(&roomCount); err != nil || roomCount != 0 {
		t.Fatal("event room created", err)
	}
}
func TestPermanentGroupShareRetryAndSecondNight(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	path := "/groups/" + g.ID
	payload := map[string]string{"requestId": key(t, f), "content": "What about this?", "eventId": sid(f.event)}
	var wg sync.WaitGroup
	for range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := f.call("POST", path+"/messages", payload, f.users[1])
			if w.Code != 200 && w.Code != 201 {
				t.Errorf("share retry %d %s", w.Code, w.Body.String())
			}
		}()
	}
	wg.Wait()
	msgs, _ := messagesAs(t, f, g, f.users[1], "")
	if len(msgs) != 1 || msgs[0].Event == nil || msgs[0].Event.ID != sid(f.event) {
		t.Fatal("share notidempotent")
	}
	if len(groupAs(t, f, g, f.users[0]).Outings) != 0 {
		t.Fatal("share implicitly createdouting")
	}
	payload["content"] = "changed request"
	want(t, f.call("POST", path+"/messages", payload, f.users[1]), 409)
	first := createOuting(t, f, g, f.users[1], map[string]any{"eventId": sid(f.event)})
	if first.OwnerID != sid(f.users[1]) || first.ChosenEventID != sid(f.event) || first.Lifecycle != "event_selected" || first.ConfirmedCount != 0 || first.AllConfirmedReady {
		t.Fatal("known event pathincorrect")
	}
	mustExec(t, f.pool, `UPDATE events SET start_time=start_time+interval '7 days',end_time=end_time+interval '7 days' WHERE id=$1`, f.otherEvent)
	second := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.otherEvent)})
	if first.ID == second.ID || first.GroupID != second.GroupID {
		t.Fatal("second night lostgroup")
	}
	mustExec(t, f.pool, `UPDATE events SET end_time=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1`, f.event)
	if readAs(t, f, first.ID, f.users[1]).Lifecycle != "completed" {
		t.Fatal("eventrealenddidnotfinishouting")
	}
	want(t, f.call("POST", path+"/messages", map[string]string{"requestId": key(t, f), "content": "Next week too"}, f.users[1]), 201)
	if len(groupAs(t, f, g, f.users[1]).Outings) != 2 {
		t.Fatal("group didnotretainbothoutings")
	}
}
func TestPermanentGroupRemovalReinvitationRevokesDataAndPreservesTickets(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	path := "/groups/" + g.ID
	p := createOuting(t, f, g, f.users[1], map[string]any{"eventId": sid(f.event)})
	attendanceAs(t, f, p, f.users[1], "yes")
	want(t, f.call("POST", path+"/messages", map[string]string{"requestId": key(t, f), "content": "private before leave"}, f.users[0]), 201)
	want(t, f.call("POST", path+"/actions", map[string]string{"action": "remove", "userId": sid(f.users[1])}, f.users[0]), 200)
	want(t, f.call("GET", path, nil, f.users[1]), 404)
	want(t, f.call("GET", path+"/messages", nil, f.users[1]), 404)
	want(t, f.call("GET", "/plans/"+p.ID, nil, f.users[1]), 404)
	got := readAs(t, f, p.ID, f.users[0])
	if got.OwnerID != sid(f.users[0]) {
		t.Fatal("abandoned outing has no coordinator")
	}
	own, hash, gen, _ := storedTicket(t, f)
	if own != f.users[0] || hash != f.initialHash || gen != 0 {
		t.Fatal("membership modified personal ticket")
	}
	want(t, f.call("POST", path+"/messages", map[string]string{"requestId": key(t, f), "content": "private while absent"}, f.users[0]), 201)
	want(t, f.call("POST", path+"/actions", map[string]string{"action": "invite", "userId": sid(f.users[1])}, f.users[0]), 200)
	want(t, f.call("POST", path+"/actions", map[string]string{"action": "accept"}, f.users[1]), 200)
	msgs, _ := messagesAs(t, f, g, f.users[1], "")
	if len(msgs) != 0 {
		t.Fatal("rejoin importedabsencehistory")
	}
	got = readAs(t, f, p.ID, f.users[1])
	if member(got, f.users[1]).Attendance != "unanswered" {
		t.Fatal("rejoin automatically confirmed attendance")
	}
}
func TestPermanentGroupDateDedupPreferencesAndDestinationVersion(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	var day string
	if err := f.pool.QueryRow(context.Background(), `SELECT ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date::text FROM events WHERE id=$1`, f.event).Scan(&day); err != nil {
		t.Fatal(err)
	}
	p := createOuting(t, f, g, f.users[1], map[string]any{"date": day, "city": "Bucuresti"})
	path := "/plans/" + p.ID
	want(t, f.call("POST", path+"/availability", map[string]string{"date": day, "answer": "yes"}, f.users[0]), 200)
	want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(f.event)}, f.users[0]), 200)
	want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(f.event)}, f.users[1]), 200)
	want(t, f.call("POST", path+"/vote", map[string]string{"eventId": sid(f.event), "answer": "yes"}, f.users[0]), 200)
	want(t, f.call("POST", path+"/choose", map[string]string{"eventId": sid(f.event)}, f.users[0]), 404)
	want(t, f.call("POST", path+"/choose", map[string]string{"eventId": sid(f.event)}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	if len(p.Options) != 1 || member(p, f.users[0]).Attendance != "unanswered" || p.ConfirmedCount != 0 {
		t.Fatal("preferences becameattendance")
	}
	attendanceAs(t, f, p, f.users[0], "yes")
	p = readAs(t, f, p.ID, f.users[0])
	if p.ConfirmedCount != 1 || p.ReadyCount != 1 || !p.AllConfirmedReady {
		t.Fatal("readiness denominatorwrong", p.ConfirmedCount, p.ReadyCount)
	}
	attendanceAs(t, f, p, f.users[1], "no")
	if readAs(t, f, p.ID, f.users[0]).ConfirmedCount != 1 {
		t.Fatal("declined member blocksconfirmedparticipants")
	}
	want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(f.otherEvent)}, f.users[0]), 200)
	want(t, f.call("POST", path+"/reopen", map[string]any{"revision": readAs(t, f, p.ID, f.users[1]).Revision, "reason": "other"}, f.users[1]), 200)
	if readAs(t, f, p.ID, f.users[1]).DecisionAt != nil {
		t.Fatal("reopening silently introduced a voting deadline")
	}
	want(t, f.call("POST", path+"/choose", map[string]string{"eventId": sid(f.otherEvent)}, f.users[1]), 200)
	changed := readAs(t, f, p.ID, f.users[0])
	if changed.DecisionRound != p.DecisionRound+1 || changed.ConfirmedCount != 0 || member(changed, f.users[0]).Attendance != "unanswered" || len(changed.Options[0].Reactions) == 0 {
		t.Fatal("version resetlostpreferences or keptattendance")
	}
	want(t, f.call("POST", path+"/attendance", map[string]any{"answer": "yes", "decisionRound": p.DecisionRound}, f.users[0]), 409)
	var wg sync.WaitGroup
	ids := make(chan string, 6)
	for range 6 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := f.call("POST", "/groups/"+g.ID+"/outings", map[string]any{"requestId": key(t, f), "date": day, "city": "Bucuresti"}, f.users[0])
			if w.Code != 200 {
				t.Errorf("duplicate night %d %s", w.Code, w.Body.String())
				return
			}
			var item plan
			_ = json.Unmarshal(w.Body.Bytes(), &item)
			ids <- item.ID
		}()
	}
	wg.Wait()
	close(ids)
	for id := range ids {
		if id != p.ID {
			t.Fatal("duplicate fixednight created")
		}
	}
}
func TestPermanentGroupPollSelectionRacesAndServerEligibility(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	day := time.Now().In(planningZone).AddDate(0, 0, 3).Format("2006-01-02")
	later := time.Now().In(planningZone).AddDate(0, 0, 4).Format("2006-01-02")
	p := createOuting(t, f, g, f.users[0], map[string]any{"dates": []string{day, later}, "city": "Bucuresti"})
	q := createOuting(t, f, g, f.users[1], map[string]any{"dates": []string{day, later}, "city": "Bucuresti"})
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for i, item := range []plan{p, q} {
		wg.Add(1)
		go func(item plan, actor pgtype.UUID) {
			defer wg.Done()
			codes <- f.call("POST", "/plans/"+item.ID+"/date", map[string]string{"date": day}, actor).Code
		}(item, f.users[i])
	}
	wg.Wait()
	close(codes)
	success, conflicts := 0, 0
	for code := range codes {
		if code == 200 {
			success++
		} else if code == 409 {
			conflicts++
		} else {
			t.Fatalf("uncontrolled concurrency error %d", code)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatal("night dedup race")
	}
	fixed := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	want(t, f.call("POST", "/plans/"+fixed.ID+"/proposals", map[string]string{"eventId": sid(f.otherEvent)}, f.users[1]), 200)
	mustExec(t, f.pool, `UPDATE events SET city='Iasi' WHERE id=$1`, f.otherEvent)
	want(t, f.call("POST", "/plans/"+fixed.ID+"/proposals", map[string]string{"eventId": sid(f.otherEvent)}, f.users[1]), 409)
	for _, action := range []string{"arrival", "meeting", "preferences", "ticket-status", "respond"} {
		want(t, f.call("POST", "/plans/"+fixed.ID+"/"+action, map[string]any{}, f.users[0]), 410)
	}
}
func TestPermanentGroupReadinessOffersUsedTicketsAndRefunds(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	attendanceAs(t, f, p, f.users[0], "yes")
	attendanceAs(t, f, p, f.users[1], "yes")
	p = readAs(t, f, p.ID, f.users[0])
	if p.ConfirmedCount != 2 || p.ReadyCount != 1 || p.AllConfirmedReady {
		t.Fatal("nonready participantmissing")
	}
	x := createInvitation(t, f)
	mustExec(t, f.pool, `UPDATE ticket_transfers SET recipient_id=$2 WHERE id=$1`, x.ID, f.users[1])
	p = readAs(t, f, p.ID, f.users[0])
	if member(p, f.users[1]).TicketState != "offered" || p.ReadyCount != 0 {
		t.Fatal("offeredticketcountsasready")
	}
	want(t, f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[1])
	if member(p, f.users[1]).TicketState != "valid" || member(p, f.users[0]).TicketState != "none" || p.ReadyCount != 1 {
		t.Fatal("ownership notauthoritative")
	}
	mustExec(t, f.pool, `SELECT set_config('spottr.validation_hash',(SELECT validation_hash FROM tickets WHERE id=$1),FALSE)`, f.ticket)
	// A scan uses the existing guarded writer with the current credential.
	_, hash, _, _ := storedTicket(t, f)
	_, err := db.New(f.pool).ValidateTicketOnce(context.Background(), db.ValidateTicketOnceParams{ID: f.ticket, ValidationHash: hash, AdmissionAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}})
	if err != nil {
		t.Fatal(err)
	}
	p = readAs(t, f, p.ID, f.users[0])
	if member(p, f.users[1]).TicketState != "used" || p.ReadyCount != 1 {
		t.Fatal("valid scanlostadmission")
	}
	mustExec(t, f.pool, `UPDATE orders SET stripe_refund_status='partial',stripe_amount_refunded_bani=1 WHERE id=$1`, f.order)
	p = readAs(t, f, p.ID, f.users[0])
	if member(p, f.users[1]).TicketState == "used" || p.ReadyCount != 0 {
		t.Fatal("refunded ticketready")
	}
}

func TestPermanentGroupTicketProjectionUsesOnlyRealAttemptsAndAdmission(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	mustExec(t, f.pool, `UPDATE ticket_types SET price_ron=0 WHERE id=$1`, f.tier)
	if member(readAs(t, f, p.ID, f.users[0]), f.users[1]).TicketState != "none" {
		t.Fatal("free registration must still require a personal admission ticket")
	}
	order := rowID(t, f.pool, `INSERT INTO orders(user_id,event_id,email,total_amount,status) VALUES($1,$2,$3,50,'pending') RETURNING id`, f.users[0], f.event, f.emails[0])
	t.Cleanup(func() { mustExec(t, f.pool, `DELETE FROM orders WHERE id=$1`, order) })
	mustExec(t, f.pool, `INSERT INTO outing_ticket_recipients(order_id,ordinal,plan_id,decision_round,event_id,recipient_id,recipient_name) VALUES($1,0,$2::uuid,$3,$4,$5,'Recipient')`, order, p.ID, p.DecisionRound, f.event, f.users[1])
	if member(readAs(t, f, p.ID, f.users[0]), f.users[1]).TicketState != "none" {
		t.Fatal("preparing a payment sheet became a public payment attempt")
	}
	mustExec(t, f.pool, `INSERT INTO checkout_payment_attempts(order_id) VALUES($1)`, order)
	if member(readAs(t, f, p.ID, f.users[0]), f.users[1]).TicketState != "processing" {
		t.Fatal("real payment attempt not reflected")
	}
	mustExec(t, f.pool, `INSERT INTO checkout_closed_payments(order_id) VALUES($1)`, order)
	mustExec(t, f.pool, `UPDATE events SET external_ticket_url='https://tickets.example.invalid' WHERE id=$1`, f.otherEvent)
	externalGroup := makeGroup(t, f, true)
	external := createOuting(t, f, externalGroup, f.users[0], map[string]any{"eventId": sid(f.otherEvent)})
	unknown := member(readAs(t, f, external.ID, f.users[0]), f.users[1])
	if unknown.TicketState != "unknown" || unknown.HasTicket != nil {
		t.Fatal("unverifiable external admission became missing ticket")
	}
}

func TestPermanentGroupBlockedOfferPreservesPurchaserAdmission(t *testing.T) {
	for _, cutoff := range []string{"offline_snapshot", "event_started"} {
		t.Run(cutoff, func(t *testing.T) {
			f := seed(t)
			g := makeGroup(t, f, true)
			p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
			x := createInvitation(t, f)
			mustExec(t, f.pool, `UPDATE ticket_transfers SET recipient_id=$2 WHERE id=$1`, x.ID, f.users[1])
			if member(readAs(t, f, p.ID, f.users[0]), f.users[1]).TicketState != "offered" {
				t.Fatal("expected an initial live offer")
			}
			if cutoff == "offline_snapshot" {
				mustExec(t, f.pool, `UPDATE tickets SET offline_credential_exposed=TRUE WHERE id=$1`, f.ticket)
			} else {
				mustExec(t, f.pool, `UPDATE events SET start_time=CURRENT_TIMESTAMP-interval '1 minute' WHERE id=$1`, f.event)
			}
			got := readAs(t, f, p.ID, f.users[0])
			if member(got, f.users[0]).TicketState != "valid" || member(got, f.users[1]).TicketState != "none" {
				t.Fatal("unacceptable pending offer hides purchaser admission or promises recipient a ticket")
			}
		})
	}
}
func TestPermanentGroupMessagesPaginationCollectionAndUnread(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	path := "/groups/" + g.ID
	for i := 0; i < 57; i++ {
		body := map[string]string{"requestId": key(t, f), "content": fmt.Sprintf("message %d", i)}
		if i == 0 || i == 56 {
			body["eventId"] = sid(f.event)
		}
		want(t, f.call("POST", path+"/messages", body, f.users[1]), 201)
	}
	newest, more := messagesAs(t, f, g, f.users[0], "")
	if len(newest) != 50 || !more {
		t.Fatal("unbounded messagepage")
	}
	older, last := messagesAs(t, f, g, f.users[0], fmt.Sprintf("?before=%d", newest[len(newest)-1].Seq))
	if len(older) != 7 || last || older[0].Seq >= newest[len(newest)-1].Seq {
		t.Fatal("cursor unstable")
	}
	collection, _ := messagesAs(t, f, g, f.users[0], "?collection=events")
	if len(collection) != 1 || collection[0].Seq != 57 {
		t.Fatal("sharedcollectionnotdeduplicated")
	}
	if groupAs(t, f, g, f.users[0]).Unread != 57 {
		t.Fatal("unreadincorrect")
	}
	want(t, f.call("POST", path+"/actions", map[string]any{"action": "read", "seq": 57}, f.users[0]), 200)
	if groupAs(t, f, g, f.users[0]).Unread != 0 {
		t.Fatal("readcursor notapplied")
	}
}
func TestPermanentGroupAdministratorTransferAndMaterialEventChange(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	path := "/groups/" + g.ID
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	attendanceAs(t, f, p, f.users[1], "yes")
	want(t, f.call("POST", path+"/actions", map[string]string{"action": "leave"}, f.users[0]), 409)
	want(t, f.call("POST", path+"/actions", map[string]string{"action": "rename", "name": "notadmin"}, f.users[1]), 404)
	before := readAs(t, f, p.ID, f.users[1])
	mustExec(t, f.pool, `UPDATE events SET title=title||' edit' WHERE id=$1`, f.event)
	if readAs(t, f, p.ID, f.users[1]).DecisionRound != before.DecisionRound {
		t.Fatal("title resetattendance")
	}
	mustExec(t, f.pool, `UPDATE events SET location_name=location_name||' changed' WHERE id=$1`, f.event)
	after := readAs(t, f, p.ID, f.users[1])
	if after.DecisionRound != before.DecisionRound+1 || member(after, f.users[1]).Attendance != "unanswered" {
		t.Fatal("materialchange needsreconfirm")
	}
	want(t, f.call("POST", path+"/actions", map[string]string{"action": "transfer-admin", "userId": sid(f.users[1])}, f.users[0]), 200)
	want(t, f.call("POST", path+"/actions", map[string]string{"action": "leave"}, f.users[0]), 200)
	if readAs(t, f, p.ID, f.users[1]).OwnerID != sid(f.users[1]) {
		t.Fatal("coordination nottransferred")
	}
}
func TestRetiredRoomsAndLegacyPlansFailClosedWithoutDeletion(t *testing.T) {
	f := seed(t)
	w := f.call("POST", "/plans", map[string]any{}, f.users[0])
	if w.Code != 410 {
		t.Fatal("legacycreationstillactive")
	}
	id := rowID(t, f.pool, `INSERT INTO outing_plans(owner_id,request_id,title,expires_at) VALUES($1,gen_random_uuid(),'Historical',CURRENT_TIMESTAMP-interval '1 day') RETURNING id`, f.users[0])
	mustExec(t, f.pool, `INSERT INTO outing_plan_members(plan_id,user_id,status) VALUES($1,$2,'accepted')`, id, f.users[0])
	want(t, f.call("GET", "/plans/"+sid(id), nil, f.users[0]), 200)
	want(t, f.call("POST", "/plans/"+sid(id)+"/vote", map[string]string{"eventId": sid(f.event)}, f.users[0]), 410)
	_, err := f.pool.Exec(context.Background(), `INSERT INTO event_safety_groups(event_id,owner_id,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP+interval '3 days')`, f.event, f.users[0])
	if err == nil || !strings.Contains(err.Error(), "EVENT_CHAT_RETIRED") {
		t.Fatal("old binary canrecreateroom", err)
	}
}
func TestNightBoundsRespectDSTAndAfterMidnight(t *testing.T) {
	for _, sample := range []struct {
		day   string
		hours float64
	}{{"2027-03-27", 23}, {"2027-10-30", 25}} {
		start, end, err := nightBounds(sample.day)
		if err != nil || end.Sub(start).Hours() != sample.hours {
			t.Fatalf("night bounds %s: %v %v", sample.day, end.Sub(start), err)
		}
	}
	f := seed(t)
	g := makeGroup(t, f, true)
	var day string
	if err := f.pool.QueryRow(context.Background(), `SELECT (CURRENT_DATE+3)::text`).Scan(&day); err != nil {
		t.Fatal(err)
	}
	mustExec(t, f.pool, `UPDATE events SET start_time=($2::date+1+time '01:00') AT TIME ZONE 'Europe/Bucharest',end_time=($2::date+1+time '04:00') AT TIME ZONE 'Europe/Bucharest' WHERE id=$1`, f.event, day)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	if p.OutingDate != day {
		t.Fatal("after-midnight nightincorrect", p.OutingDate, day)
	}
}

func TestPermanentGroupFixedAndSelectedNightExpiryAcrossDST(t *testing.T) {
	f := seed(t)
	fixedGroup, pollGroup := makeGroup(t, f, true), makeGroup(t, f, true)
	now := time.Now().In(planningZone)
	checked := 0
	for _, year := range []int{now.Year(), now.Year() + 1} {
		for _, month := range []time.Month{time.March, time.October} {
			transition := time.Date(year, month, 31, 12, 0, 0, 0, planningZone)
			transition = transition.AddDate(0, 0, -int(transition.Weekday()))
			day := transition.AddDate(0, 0, -1).Format("2006-01-02")
			if !validPlanningDate(day, now) {
				continue
			}
			_, expected, err := nightBounds(day)
			if err != nil {
				t.Fatal(err)
			}
			fixed := createOuting(t, f, fixedGroup, f.users[0], map[string]any{"date": day, "city": "Bucuresti"})
			later := transition.AddDate(0, 0, 1).Format("2006-01-02")
			poll := createOuting(t, f, pollGroup, f.users[0], map[string]any{"dates": []string{day, later}, "city": "Bucuresti"})
			want(t, f.call("POST", "/plans/"+poll.ID+"/date", map[string]string{"date": day}, f.users[0]), 200)
			for _, id := range []string{fixed.ID, poll.ID} {
				var expiry time.Time
				if err := f.pool.QueryRow(context.Background(), `SELECT expires_at FROM outing_plans WHERE id=$1`, id).Scan(&expiry); err != nil {
					t.Fatal(err)
				}
				if !expiry.Equal(expected) || expiry.In(planningZone).Hour() != 6 {
					t.Fatalf("night %s expires at %s; expected local 06:00 %s", day, expiry, expected)
				}
			}
			checked++
		}
	}
	if checked == 0 {
		t.Fatal("no upcoming DST boundary tested")
	}
}

func TestPermanentGroupCannotShareUnpublishedEvent(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	for _, state := range []string{"draft", "scheduled"} {
		mustExec(t, f.pool, `UPDATE events SET status=$2 WHERE id=$1`, f.otherEvent, state)
		want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]string{"requestId": key(t, f), "eventId": sid(f.otherEvent)}, f.users[1]), 400)
		want(t, f.call("POST", "/groups/"+g.ID+"/outings", map[string]string{"requestId": key(t, f), "eventId": sid(f.otherEvent)}, f.users[1]), 400)
		want(t, f.call("POST", "/plans/"+p.ID+"/proposals", map[string]string{"eventId": sid(f.otherEvent)}, f.users[1]), 409)
		want(t, f.call("POST", "/groups", map[string]any{"requestId": key(t, f), "name": "Private event", "friendIds": []string{sid(f.users[1])}, "eventId": sid(f.otherEvent)}, f.users[0]), 400)
	}
}

func TestGroupCreationAtomicShareAndImmutableRetryOwner(t *testing.T) {
	f := seed(t)
	requestID := key(t, f)
	draft := map[string]any{"requestId": requestID, "name": "Atomic group", "friendIds": []string{sid(f.users[1])}, "eventId": sid(f.event)}
	w := f.call("POST", "/groups", draft, f.users[0])
	want(t, w, 201)
	var g friendGroup
	if err := json.Unmarshal(w.Body.Bytes(), &g); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, sql := range []string{`DELETE FROM notifications WHERE friend_group_id=$1`, `DELETE FROM friend_group_messages WHERE group_id=$1`, `DELETE FROM friend_group_members WHERE group_id=$1`, `DELETE FROM friend_groups WHERE id=$1`} {
			mustExec(t, f.pool, sql, g.ID)
		}
	})
	messages, _ := messagesAs(t, f, g, f.users[0], "")
	if len(messages) != 1 || messages[0].Kind != "event" || len(g.Outings) != 0 {
		t.Fatal("atomicshare createdwrongentities")
	}
	want(t, f.call("POST", "/groups/"+g.ID+"/actions", map[string]string{"action": "accept"}, f.users[1]), 200)
	want(t, f.call("POST", "/groups/"+g.ID+"/actions", map[string]string{"action": "transfer-admin", "userId": sid(f.users[1])}, f.users[0]), 200)
	w = f.call("POST", "/groups", draft, f.users[0])
	want(t, w, 200)
	var retry friendGroup
	_ = json.Unmarshal(w.Body.Bytes(), &retry)
	if retry.ID != g.ID || retry.OwnerID != sid(f.users[1]) {
		t.Fatal("admintransfer brokeidempotency")
	}
	messages, _ = messagesAs(t, f, g, f.users[0], "")
	if len(messages) != 1 {
		t.Fatal("retry duplicatedatomicshare")
	}
}

func TestGroupHistoryPaginatesWithoutHydratingSocialList(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	for i := 0; i < 23; i++ {
		id := rowID(t, f.pool, `INSERT INTO outing_plans(group_id,owner_id,request_id,title,expires_at) VALUES($1,$2,gen_random_uuid(),$3,CURRENT_TIMESTAMP-interval '1 day') RETURNING id`, g.ID, f.users[0], fmt.Sprintf("Past %02d", i))
		mustExec(t, f.pool, `INSERT INTO outing_plan_members(plan_id,user_id,status) VALUES($1,$2,'accepted'),($1,$3,'accepted')`, id, f.users[0], f.users[1])
	}
	detail := groupAs(t, f, g, f.users[0])
	if len(detail.Outings) != 20 || !detail.OutingsHasMore {
		t.Fatal("detailhistory unbounded")
	}
	w := f.call("GET", "/groups", nil, f.users[0])
	want(t, w, 200)
	var groups []friendGroup
	if err := json.Unmarshal(w.Body.Bytes(), &groups); err != nil {
		t.Fatal(err)
	}
	for _, item := range groups {
		if item.ID == g.ID && len(item.Outings) != 0 {
			t.Fatal("sociallist hydratedfullhistory")
		}
	}
	w = f.call("GET", "/groups/"+g.ID+"/outings?before="+detail.Outings[19].ID, nil, f.users[0])
	want(t, w, 200)
	var page struct {
		Items   []plan `json:"items"`
		HasMore bool   `json:"hasMore"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 3 || page.HasMore {
		t.Fatal("historycursor skippedorduplicatedentries")
	}
	want(t, f.call("GET", "/plans/"+page.Items[2].ID, nil, f.users[1]), 200)
}

func TestGroupOwnerAccountDeletionTransfersOnlyCoordination(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	mustExec(t, f.pool, `DELETE FROM users WHERE id=$1`, f.users[0])
	group := groupAs(t, f, g, f.users[1])
	if group.OwnerID != sid(f.users[1]) {
		t.Fatal("deletedadmin strandedgroup")
	}
	if readAs(t, f, p.ID, f.users[1]).OwnerID != sid(f.users[1]) {
		t.Fatal("deletedinitiator strandedouting")
	}
}

func TestLastGroupOwnerAccountDeletionPreservesPrivateHistory(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	want(t, f.call("POST", "/groups/"+g.ID+"/actions", map[string]string{"action": "leave"}, f.users[1]), 200)
	mustExec(t, f.pool, `DELETE FROM users WHERE id=$1`, f.users[0])
	var preserved bool
	if err := f.pool.QueryRow(context.Background(), `SELECT EXISTS(SELECT 1 FROM outing_plans p JOIN friend_groups g ON g.id=p.group_id WHERE p.id=$1 AND p.owner_id IS NULL AND g.owner_id IS NULL)`, p.ID).Scan(&preserved); err != nil || !preserved {
		t.Fatal("last account deletion removed private outing history", err)
	}
	want(t, f.call("GET", "/groups/"+g.ID, nil, f.users[1]), 404)
	want(t, f.call("GET", "/plans/"+p.ID, nil, f.users[1]), 404)
}
