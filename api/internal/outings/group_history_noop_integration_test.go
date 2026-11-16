package outings

import (
	"context"
	"testing"
	"time"
)

// These checks distinguish repeated HTTP requests from deliberate context edits.
// The UI may compact history, but the database must retain each real transition.
func TestGroupHistoryNoOpAndRetriedDecisionsDoNotDuplicateMessages(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	var day string
	if err := f.pool.QueryRow(context.Background(), `SELECT ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date::text FROM events WHERE id=$1`, f.event).Scan(&day); err != nil {
		t.Fatal(err)
	}
	draft := map[string]any{"date": day, "city": "Bucuresti", "requestId": key(t, f)}
	p := createOuting(t, f, g, f.users[0], draft)
	path := "/plans/" + p.ID
	counts := func() [3]int {
		t.Helper()
		var got [3]int
		if err := f.pool.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM friend_group_messages WHERE group_id=$1),(SELECT count(*) FROM notifications WHERE friend_group_id=$1),(SELECT count(*) FROM outing_plan_context_history WHERE plan_id=$2)`, g.ID, p.ID).Scan(&got[0], &got[1], &got[2]); err != nil {
			t.Fatal(err)
		}
		return got
	}
	initial := counts()
	unchanged := contextCall(t, f, p, map[string]any{"date": day, "city": "București", "title": p.Title}, 0, 200)
	if unchanged.Revision != p.Revision || unchanged.DecisionRound != p.DecisionRound || counts() != initial {
		t.Fatal("saving an unchanged canonical context mutated its history")
	}
	want(t, f.call("POST", "/groups/"+g.ID+"/outings", draft, f.users[0]), 200)
	want(t, f.call("POST", "/groups/"+g.ID+"/outings", map[string]any{"date": day, "city": "Bucuresti", "requestId": key(t, f)}, f.users[1]), 200)
	if counts() != initial {
		t.Fatal("reusing the same night duplicated its invitation")
	}
	want(t, f.call("POST", path+"/proposals", map[string]any{"eventId": sid(f.event)}, f.users[0]), 200)
	afterProposal := counts()
	if afterProposal[0] != initial[0]+1 {
		t.Fatal("explicit proposal did not create one canonical event reference")
	}
	p = readAs(t, f, p.ID, f.users[0])
	choose := map[string]any{"eventId": sid(f.event), "revision": p.Revision}
	want(t, f.call("POST", path+"/choose", choose, f.users[0]), 200)
	chosen := readAs(t, f, p.ID, f.users[0])
	afterChoose := counts()
	if afterChoose[0] != afterProposal[0]+1 || afterChoose[1] != afterProposal[1]+1 {
		t.Fatal("a real destination selection did not emit one notification and snapshot")
	}
	want(t, f.call("POST", path+"/choose", choose, f.users[0]), 409)
	want(t, f.call("POST", path+"/choose", map[string]any{"eventId": sid(f.event), "revision": chosen.Revision}, f.users[0]), 200)
	if counts() != afterChoose || readAs(t, f, p.ID, f.users[0]).Revision != chosen.Revision {
		t.Fatal("repeated destination selection duplicated its audit or changed its revision")
	}
	reopen := map[string]any{"revision": chosen.Revision, "reason": "other"}
	want(t, f.call("POST", path+"/reopen", reopen, f.users[0]), 200)
	reopened := readAs(t, f, p.ID, f.users[0])
	afterReopen := counts()
	want(t, f.call("POST", path+"/reopen", reopen, f.users[0]), 200)
	if counts() != afterReopen || readAs(t, f, p.ID, f.users[0]).Revision != reopened.Revision {
		t.Fatal("an acknowledged reopen repeated its history event")
	}
	night, err := time.Parse("2006-01-02", day)
	if err != nil {
		t.Fatal(err)
	}
	change := map[string]any{"revision": reopened.Revision, "date": night.AddDate(0, 0, 1).Format("2006-01-02"), "city": "Bucuresti", "confirmImpact": true}
	changed := contextCall(t, f, reopened, change, 0, 200)
	afterChange := counts()
	if afterChange[0] != afterReopen[0]+1 || afterChange[2] != afterReopen[2]+1 {
		t.Fatal("a deliberate context change lost its original audit history")
	}
	contextCall(t, f, reopened, change, 0, 200)
	contextCall(t, f, changed, map[string]any{"date": changed.OutingDate, "city": changed.City}, 0, 200)
	if counts() != afterChange {
		t.Fatal("context retry or no-op produced another historical update")
	}
	if messages, _ := messagesAs(t, f, g, f.users[1], ""); len(messages) != afterChange[0] || messages[len(messages)-1].OutingContext.OutingDate != day {
		t.Fatal("group history was rewritten or hidden from the accepted member")
	}
}

func TestRepeatedAttendanceKeepsSavedResponseAndRevision(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
	attendanceAs(t, f, p, f.users[1], "yes")
	saved := readAs(t, f, p.ID, f.users[0])
	var savedAt time.Time
	if err := f.pool.QueryRow(context.Background(), `SELECT responded_at FROM outing_attendance WHERE plan_id=$1 AND user_id=$2 AND decision_round=$3`, p.ID, f.users[1], p.DecisionRound).Scan(&savedAt); err != nil {
		t.Fatal(err)
	}
	messagesBefore, _ := messagesAs(t, f, g, f.users[0], "")
	attendanceAs(t, f, saved, f.users[1], "yes")
	var unchangedAt time.Time
	if err := f.pool.QueryRow(context.Background(), `SELECT responded_at FROM outing_attendance WHERE plan_id=$1 AND user_id=$2 AND decision_round=$3`, p.ID, f.users[1], p.DecisionRound).Scan(&unchangedAt); err != nil {
		t.Fatal(err)
	}
	unchanged := readAs(t, f, p.ID, f.users[0])
	if unchanged.Revision != saved.Revision || !savedAt.Equal(unchangedAt) {
		t.Fatal("an unchanged attendance answer changed its revision or original response time")
	}
	attendanceAs(t, f, unchanged, f.users[1], "no")
	changed := readAs(t, f, p.ID, f.users[0])
	if changed.Revision <= saved.Revision || member(changed, f.users[1]).Attendance != "no" {
		t.Fatal("a deliberate attendance change was incorrectly discarded")
	}
	messagesAfter, _ := messagesAs(t, f, g, f.users[0], "")
	if len(messagesAfter) != len(messagesBefore) {
		t.Fatal("personal responses created conversation system updates")
	}
}
