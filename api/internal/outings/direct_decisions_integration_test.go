package outings

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	db "pulse-api/db/generated"
)

// These tests exercise the authenticated HTTP routes and persisted PostgreSQL
// rows. They run only against the existing guarded, loopback test database.
func TestGroupDirectDecisionsTwoAccountsAndHistoricalContexts(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	var day string
	if err := f.pool.QueryRow(context.Background(), `SELECT ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date::text FROM events WHERE id=$1`, f.event).Scan(&day); err != nil {
		t.Fatal(err)
	}
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": day, "city": "Bucuresti"})
	path := "/plans/" + p.ID
	initialMessages, _ := messagesAs(t, f, g, f.users[1], "")
	if len(initialMessages) != 1 || initialMessages[0].OutingContext == nil || initialMessages[0].OutingContext.OutingDate != day {
		t.Fatal("initial outing question has no snapshot")
	}
	initialContext := *initialMessages[0].OutingContext
	activityCounts := func() (int, int, int) {
		t.Helper()
		var messages, notifications, orders int
		if err := f.pool.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM friend_group_messages WHERE group_id=$1),(SELECT count(*) FROM notifications WHERE friend_group_id=$1),(SELECT count(*) FROM orders WHERE user_id=ANY($2))`, g.ID, f.users[:]).Scan(&messages, &notifications, &orders); err != nil {
			t.Fatal(err)
		}
		return messages, notifications, orders
	}
	messagesBefore, notificationsBefore, ordersBefore := activityCounts()
	want(t, f.call("POST", path+"/availability", map[string]any{"date": day, "answer": "yes", "revision": p.Revision}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	if len(p.CandidateDates) != 1 || len(p.CandidateDates[0].Responses) != 1 || p.CandidateDates[0].Responses[0].UserID != sid(f.users[1]) {
		t.Fatal("second actor's availability was not projected")
	}
	for _, event := range []string{sid(f.event), sid(f.otherEvent)} {
		want(t, f.call("POST", path+"/proposals", map[string]any{"eventId": event}, f.users[0]), 200)
	}
	for _, vote := range []struct{ event, answer string }{{sid(f.event), "yes"}, {sid(f.otherEvent), "maybe"}} {
		p = readAs(t, f, p.ID, f.users[1])
		want(t, f.call("POST", path+"/vote", map[string]any{"eventId": vote.event, "answer": vote.answer, "revision": p.Revision}, f.users[1]), 200)
	}
	// A new handler represents reconnection: no client or handler-local poll cache.
	reconnect := f
	reconnect.handler = &Handler{Pool: f.pool}
	p = readAs(t, reconnect, p.ID, f.users[0])
	reactions := 0
	for _, option := range p.Options {
		for _, reaction := range option.Reactions {
			if reaction.UserID == sid(f.users[1]) {
				reactions++
			}
		}
	}
	if reactions != 2 || p.ChosenEventID != "" {
		t.Fatal("multiple personal preferences were lost or became a decision")
	}
	messagesAfter, notificationsAfter, ordersAfter := activityCounts()
	if messagesAfter != messagesBefore || notificationsAfter != notificationsBefore || ordersAfter != ordersBefore {
		t.Fatal("responses created messages, notifications or an order")
	}
	want(t, f.call("POST", path+"/choose", map[string]any{"eventId": sid(f.event)}, f.users[1]), 404)
	want(t, f.call("POST", path+"/choose", map[string]any{"eventId": sid(f.event)}, f.users[0]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	attendanceAs(t, f, p, f.users[1], "yes")
	p = readAs(t, reconnect, p.ID, f.users[0])
	if member(p, f.users[0]).Attendance != "unanswered" || member(p, f.users[1]).Attendance != "yes" {
		t.Fatal("attendance mixed with the ticket or preference")
	}
	msgs, _ := messagesAs(t, reconnect, g, f.users[1], "")
	if len(msgs) != 2 || msgs[0].OutingContext == nil || msgs[0].OutingContext.ChosenEventID != sid(f.event) || msgs[1].OutingContext.ChosenEventID != "" {
		t.Fatal("choosing a destination relabelled an older question")
	}
	currentRound := p.DecisionRound
	next, _ := time.Parse("2006-01-02", day)
	nextDay := next.AddDate(0, 0, 1).Format("2006-01-02")
	p = contextCall(t, f, p, map[string]any{"date": nextDay, "city": "Iasi", "confirmImpact": true}, 0, 200)
	if p.DecisionRound != currentRound+1 || p.ChosenEventID != "" || member(p, f.users[1]).Attendance != "unanswered" {
		t.Fatal("new context reused a previous attendance")
	}
	for _, option := range p.Options {
		if len(option.Reactions) > 0 {
			t.Fatal("old event preferences used for a new context")
		}
	}
	for _, candidate := range p.CandidateDates {
		if len(candidate.Responses) > 0 {
			t.Fatal("old availability used for a new date")
		}
	}
	want(t, f.call("POST", path+"/attendance", map[string]any{"answer": "yes", "decisionRound": currentRound}, f.users[1]), 409)
	msgs, _ = messagesAs(t, reconnect, g, f.users[1], "")
	if len(msgs) != 3 || msgs[0].OutingContext.OutingDate != nextDay || msgs[0].OutingContext.City != "Iasi" || msgs[2].OutingContext.OutingDate != initialContext.OutingDate || msgs[2].OutingContext.City != initialContext.City {
		t.Fatal("historical message context was rewritten")
	}
	if _, _, orders := activityCounts(); orders != ordersBefore {
		t.Fatal("a vote or context change started a payment")
	}
}

func TestGroupClosedAttendancePreservesConversation(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	mustExec(t, f.pool, `UPDATE events SET status='cancelled' WHERE id=$1`, f.event)
	want(t, f.call("POST", "/plans/"+p.ID+"/attendance", map[string]any{"answer": "yes", "decisionRound": p.DecisionRound}, f.users[1]), 409)
	if got := readAs(t, f, p.ID, f.users[1]); got.Lifecycle != "cancelled" || member(got, f.users[1]).Attendance != "unanswered" {
		t.Fatal("cancelled destination still accepts responses")
	}
	want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "Let's find another night"}, f.users[1]), 201)
	mustExec(t, f.pool, `UPDATE outing_plans SET expires_at=clock_timestamp()-interval '1 minute' WHERE id=$1`, p.ID)
	want(t, f.call("POST", "/plans/"+p.ID+"/availability", map[string]any{"date": p.OutingDate, "answer": "yes"}, f.users[1]), 404)
	if got := groupAs(t, f, g, f.users[0]); got.Status != "accepted" || got.PreviewKind != "text" || got.PreviewAuthor == "" {
		t.Fatal("ending an outing closed the conversation or lost message metadata")
	}
}

func TestUnnamedGroupsAndMessageContextCompatibility(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	want(t, f.call("POST", "/groups/"+g.ID+"/actions", map[string]any{"action": "rename", "name": ""}, f.users[0]), 200)
	if got := groupAs(t, f, g, f.users[1]); got.Name != "" {
		t.Fatal("server invented a group name")
	}
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	// Historical rows intentionally remain without snapshots; their history and
	// membership are retained, but clients must not turn them into new polls.
	mustExec(t, f.pool, `UPDATE friend_group_messages SET outing_context=NULL WHERE group_id=$1`, g.ID)
	messages, _ := messagesAs(t, f, g, f.users[1], "")
	if len(messages) != 1 || messages[0].OutingContext != nil || messages[0].OutingID != p.ID {
		t.Fatal("legacy message compatibility lost")
	}
	w := f.call("POST", "/groups", map[string]any{"requestId": key(t, f), "name": "", "friendIds": []string{sid(f.users[1])}}, f.users[0])
	want(t, w, 201)
	var extra friendGroup
	if err := json.Unmarshal(w.Body.Bytes(), &extra); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		mustExec(t, f.pool, `DELETE FROM notifications WHERE friend_group_id=$1`, extra.ID)
		mustExec(t, f.pool, `DELETE FROM friend_group_members WHERE group_id=$1`, extra.ID)
		mustExec(t, f.pool, `DELETE FROM friend_groups WHERE id=$1`, extra.ID)
	})
	if extra.Name != "" {
		t.Fatal("empty group name was not preserved")
	}
}

func TestFriendsSocialProjectionDistinctPeopleAndPrivateAttendance(t *testing.T) {
	f := seed(t)
	q := db.New(f.pool)
	mustExec(t, f.pool, `UPDATE users SET show_attendance_publicly=TRUE WHERE id=$1`, f.users[0])
	mustExec(t, f.pool, `INSERT INTO event_rsvps(event_id,user_id,status) VALUES($1,$2,'going')`, f.event, f.users[0])
	mustExec(t, f.pool, `INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash) VALUES($1,$2,$3,$4)`, f.order, f.tier, f.users[0], "extra"+f.initialHash[5:])
	items, err := q.ListSocialFeed(context.Background(), f.users[1])
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	ticketCount := 0
	goingCount := 0
	for _, item := range items {
		if item.EventID == f.event && item.ActorID == f.users[0] {
			count++
			if item.ActivityType == "friend_ticket" {
				ticketCount++
			}
			if item.ActivityType == "friend_going" {
				goingCount++
			}
			if !item.EventEndTime.Valid || item.EventLocation != "Venue" || item.EventCity != "Bucuresti" {
				t.Fatal("feed lost factual event context")
			}
		}
	}
	if count != 2 || ticketCount != 1 || goingCount != 1 {
		t.Fatalf("two tickets and RSVP must preserve one factual activity of each kind: total=%d tickets=%d going=%d", count, ticketCount, goingCount)
	}
	mustExec(t, f.pool, `UPDATE users SET show_attendance_publicly=FALSE WHERE id=$1`, f.users[0])
	items, err = q.ListSocialFeed(context.Background(), f.users[1])
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.ActorID == f.users[0] {
			t.Fatal("private attendance leaked into Friends")
		}
	}
	mustExec(t, f.pool, `UPDATE users SET show_attendance_publicly=TRUE WHERE id=$1`, f.users[0])
	mustExec(t, f.pool, `UPDATE events SET start_time=clock_timestamp()-interval '2 days',end_time=clock_timestamp()-interval '1 day' WHERE id=$1`, f.event)
	items, err = q.ListSocialFeed(context.Background(), f.users[1])
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.EventID == f.event {
			t.Fatal("ended event appeared as an upcoming night")
		}
	}
}

func TestExistingOutingBeyondFirstDetailPageIsReturnedWithoutDuplication(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	original := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	start, err := time.Parse("2006-01-02", original.OutingDate)
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 20; i++ {
		createOuting(t, f, g, f.users[0], map[string]any{"date": start.AddDate(0, 0, i).Format("2006-01-02"), "city": "Bucuresti"})
	}
	detail := groupAs(t, f, g, f.users[1])
	if len(detail.Outings) != 20 || !detail.OutingsHasMore {
		t.Fatal("fixture does not exercise the first detail page")
	}
	for _, p := range detail.Outings {
		if p.ID == original.ID {
			t.Fatal("older outing unexpectedly present in first page")
		}
	}
	w := f.call("POST", "/groups/"+g.ID+"/outings", map[string]any{"requestId": key(t, f), "eventId": sid(f.otherEvent)}, f.users[1])
	want(t, w, 200)
	var reused plan
	if err := json.Unmarshal(w.Body.Bytes(), &reused); err != nil {
		t.Fatal(err)
	}
	if reused.ID != original.ID || reused.ChosenEventID != original.ChosenEventID || reused.Revision != original.Revision {
		t.Fatal("known night did not return its authoritative existing outing")
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM outing_plans WHERE group_id=$1`, g.ID).Scan(&count); err != nil || count != 21 {
		t.Fatal("reusing an old outing duplicated the night", count, err)
	}
	// The client can then explicitly add the shared alternative through the
	// existing proposal operation without changing the chosen destination.
	want(t, f.call("POST", "/plans/"+reused.ID+"/proposals", map[string]any{"eventId": sid(f.otherEvent), "revision": reused.Revision}, f.users[1]), 200)
	got := readAs(t, f, reused.ID, f.users[0])
	if len(got.Options) != 2 || got.ChosenEventID != original.ChosenEventID {
		t.Fatal("adding an alternative lost or changed the existing decision")
	}
}
