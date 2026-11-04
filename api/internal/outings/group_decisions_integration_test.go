package outings

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func createGroupDecision(t *testing.T, f fixture) plan {
	t.Helper()
	draft := planningDraft(t, f)
	day := draft.OutingDate
	draft.OutingDate = ""
	draft.CandidateDates = []string{day, time.Now().In(planningZone).AddDate(0, 0, 3).Format("2006-01-02")}
	deadline := time.Now().Add(time.Hour)
	draft.DecisionAt = &deadline
	w := f.call("POST", "/plans", draft, f.users[0])
	want(t, w, 201)
	var p plan
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	if p.OutingDate != "" || len(p.CandidateDates) != 2 || len(p.Options) != 0 {
		t.Fatal("date proposals must precede event proposals")
	}
	want(t, f.call("POST", "/plans", draft, f.users[0]), 200)
	return p
}

func TestGroupDecisionPrivacyReactionsMeetupAndPlanB(t *testing.T) {
	f := seed(t)
	const avatar = "https://example.test/member-profile.jpg"
	mustExec(t, f.pool, `UPDATE users SET avatar_url=$2 WHERE id=$1`, f.users[1], avatar)
	p := createGroupDecision(t, f)
	for _, member := range p.Members {
		if member.UserID == sid(f.users[1]) && member.AvatarURL != avatar {
			t.Fatal("invited friend's profile photo missing from creator's plan")
		}
	}
	path := "/plans/" + p.ID
	day := p.CandidateDates[0].Date
	pending := readAs(t, f, p.ID, f.users[1])
	if len(pending.CandidateDates) != 2 || len(pending.CandidateDates[0].Responses) != 0 || pending.MyBudgetRon != nil {
		t.Fatal("invitation privacy")
	}
	want(t, f.call("POST", path+"/availability", map[string]string{"date": day, "answer": "yes"}, f.users[1]), 404)
	want(t, f.call("POST", path+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 200)
	want(t, f.call("POST", path+"/availability", map[string]string{"date": day, "answer": "maybe"}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	for _, member := range p.Members {
		if member.UserID == sid(f.users[1]) && member.AvatarURL != avatar {
			t.Fatal("accepted friend's profile photo missing from group")
		}
	}
	revision := p.Revision
	want(t, f.call("POST", path+"/availability", map[string]string{"date": day, "answer": "maybe"}, f.users[1]), 200)
	if readAs(t, f, p.ID, f.users[0]).Revision != revision {
		t.Fatal("identical availability must not create a new revision")
	}
	want(t, f.call("POST", path+"/date", map[string]string{"date": day}, f.users[1]), 404)
	want(t, f.call("POST", path+"/date", map[string]string{"date": day}, f.users[0]), 200)
	want(t, f.call("POST", path+"/availability", map[string]string{"date": day, "answer": "no"}, f.users[1]), 409)
	want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(f.event)}, f.users[1]), 200)
	want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(f.otherEvent)}, f.users[0]), 200)
	for _, event := range []string{sid(f.event), sid(f.otherEvent)} {
		want(t, f.call("POST", path+"/vote", map[string]string{"eventId": event, "answer": "yes"}, f.users[1]), 200)
	}
	p = readAs(t, f, p.ID, f.users[0])
	for _, option := range p.Options {
		if len(option.Reactions) != 1 || option.Reactions[0].Answer != "yes" {
			t.Fatal("a member can support multiple options")
		}
	}
	want(t, f.call("POST", path+"/preferences", map[string]float64{"budgetRon": 50}, f.users[0]), 200)
	want(t, f.call("POST", path+"/preferences", map[string]float64{"budgetRon": 100}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	if p.MyBudgetRon == nil || *p.MyBudgetRon != 50 || p.BudgetCount != 2 || p.Options[0].BudgetFits != 1 || p.Options[0].TotalPriceRon == nil || *p.Options[0].TotalPriceRon != 54 {
		t.Fatalf("private budget / customer fee quote mismatch: %+v", p.Options[0])
	}
	friend := readAs(t, f, p.ID, f.users[1])
	if friend.MyBudgetRon == nil || *friend.MyBudgetRon != 100 {
		t.Fatal("other member's budget leaked")
	}
	want(t, f.call("POST", path+"/preferences", map[string]float64{"budgetRon": 1.001}, f.users[0]), 400)
	want(t, f.call("POST", path+"/choose", map[string]string{"eventId": sid(f.event)}, f.users[0]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	if p.ChosenEventID != sid(f.event) {
		t.Fatal("destination missing")
	}
	start, _, _ := nightBounds(day)
	meeting := start.Add(16 * time.Hour)
	want(t, f.call("POST", path+"/meeting", map[string]any{"place": "Main entrance", "at": meeting}, f.users[0]), 200)
	want(t, f.call("POST", path+"/meeting", map[string]any{"place": "Override"}, f.users[1]), 404)
	want(t, f.call("POST", path+"/arrival", map[string]string{"status": "on_way"}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	if p.MeetingPoint != "Main entrance" || p.MeetingAt == nil {
		t.Fatal("meetup not shared")
	}
	for _, m := range p.Members {
		if m.UserID == sid(f.users[1]) && m.ArrivalStatus != "on_way" {
			t.Fatal("manual arrival not shared")
		}
	}
	want(t, f.call("POST", path+"/reopen", map[string]any{"revision": p.Revision, "reason": "sold_out"}, f.users[1]), 404)
	want(t, f.call("POST", path+"/reopen", map[string]any{"revision": p.Revision - 1, "reason": "sold_out"}, f.users[0]), 409)
	revision = p.Revision
	want(t, f.call("POST", path+"/reopen", map[string]any{"revision": revision, "reason": "sold_out"}, f.users[0]), 200)
	want(t, f.call("POST", path+"/reopen", map[string]any{"revision": revision, "reason": "sold_out"}, f.users[0]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	if p.ChosenEventID != "" || len(p.PreviousEvents) != 1 || p.MeetingPoint != "" {
		t.Fatal("plan B did not reopen cleanly")
	}
	for _, m := range p.Members {
		if m.UserID == sid(f.users[0]) && !m.HasPreviousTicket {
			t.Fatal("existing ticket holder lost from plan B")
		}
	}
	var ticketCount int
	var orderStatus string
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM tickets WHERE id=$1 AND user_id=$2`, f.ticket, f.users[0]).Scan(&ticketCount); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(context.Background(), `SELECT status FROM orders WHERE id=$1`, f.order).Scan(&orderStatus); err != nil {
		t.Fatal(err)
	}
	if ticketCount != 1 || orderStatus != "completed" {
		t.Fatal("plan B changed financial/admission ownership")
	}
	want(t, f.call("GET", path+"/changes?revision=0", nil, f.users[0]), 200)
	want(t, f.call("GET", path+"/changes?revision=0", nil, f.users[2]), 404)
}

func TestNightAfterMidnightAndDeadlineEnforcement(t *testing.T) {
	f := seed(t)
	p := createGroupDecision(t, f)
	path := "/plans/" + p.ID
	day := p.CandidateDates[0].Date
	want(t, f.call("POST", path+"/date", map[string]string{"date": day}, f.users[0]), 200)
	mustExec(t, f.pool, `UPDATE events SET start_time=($2::date+1+time '01:00') AT TIME ZONE 'Europe/Bucharest',end_time=($2::date+1+time '05:00') AT TIME ZONE 'Europe/Bucharest' WHERE id=$1`, f.event, day)
	want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(f.event)}, f.users[0]), 200)
	mustExec(t, f.pool, `UPDATE outing_plans SET decision_at=now()-interval '1 second' WHERE id=$1`, p.ID)
	w := f.call("POST", path+"/vote", map[string]string{"eventId": sid(f.event), "answer": "yes"}, f.users[0])
	want(t, w, 409)
	if !strings.Contains(w.Body.String(), "VOTING_CLOSED") {
		t.Fatal(w.Body.String())
	}
	if err := f.handler.notifyPlanDeadlines(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := f.handler.notifyPlanDeadlines(context.Background()); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM notifications WHERE user_id=$1 AND type='outing_plan_deadline'`, f.users[0]).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate deadline notifications: %d %v", count, err)
	}
	// Deadline closes responses, never forces a purchase or takes the owner's choice away.
	want(t, f.call("POST", path+"/choose", map[string]string{"eventId": sid(f.event)}, f.users[0]), 200)
}

func TestNightBoundsRespectDST(t *testing.T) {
	for _, sample := range []struct {
		day   string
		hours time.Duration
	}{{"2026-03-28", 23}, {"2026-10-24", 25}, {"2026-11-03", 24}} {
		start, end, err := nightBounds(sample.day)
		if err != nil || end.Sub(start) != sample.hours*time.Hour {
			t.Fatalf("%s: night duration %v, %v", sample.day, end.Sub(start), err)
		}
	}
}
