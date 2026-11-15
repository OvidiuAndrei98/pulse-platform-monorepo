package outings

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func contextCall(t *testing.T, f fixture, p plan, changes map[string]any, actor int, code int) plan {
	t.Helper()
	if changes["revision"] == nil {
		changes["revision"] = p.Revision
	}
	if changes["city"] == nil {
		changes["city"] = p.City
	}
	w := f.call("POST", "/plans/"+p.ID+"/context", changes, f.users[actor])
	want(t, w, code)
	var result plan
	if code == 200 {
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
	}
	return result
}

// Public metadata read from the same localhost:8081 events API on 15 Nov 2026.
// Only the local fixture is changed; no request mutates the user's live group.
func TestKnownPublicEventDTOCreatesOuting(t *testing.T) {
	for _, sample := range []struct{ title, city, start, end string }{
		{"ROOF TOP", "Bucuresti", "2026-11-26T18:00:00Z", "2026-11-30T11:28:00Z"},
		{"AFTER DARK", "Bucuresti", "2026-11-20T11:29:00Z", "2026-12-30T11:29:00Z"},
		{"Best Party", "Bucuresti", "2026-11-29T23:15:00Z", "2026-12-23T23:15:00Z"},
		{"AFTER DARK with display diacritics", "București", "2026-11-20T11:29:00Z", "2026-12-30T11:29:00Z"},
		{"POOL PARTY still in progress", "Bucuresti", "2026-11-08T18:00:00Z", "2026-11-19T18:00:00Z"},
	} {
		t.Run(sample.title, func(t *testing.T) {
			start, err := time.Parse(time.RFC3339, sample.start)
			if err != nil {
				t.Fatal(err)
			}
			end, err := time.Parse(time.RFC3339, sample.end)
			if err != nil {
				t.Fatal(err)
			}
			if !end.After(time.Now()) {
				t.Skip("captured public event has ended; refresh the read-only API fixture")
			}
			f := seed(t)
			g := makeGroup(t, f, true)
			mustExec(t, f.pool, `UPDATE events SET title=$2,city=$3,start_time=$4,end_time=$5 WHERE id=$1`, f.event, sample.title, sample.city, start, end)
			p := createOuting(t, f, g, f.users[0], map[string]any{"eventId": sid(f.event)})
			expected := start.In(planningZone).Add(-6 * time.Hour).Format("2006-01-02")
			if p.ChosenEventID != sid(f.event) || p.OutingDate != expected || p.City != "Bucuresti" || !p.ExpiresAt.Equal(end) {
				t.Fatal("known public event context was not derived from its actual occurrence", p.OutingDate, p.City, p.ExpiresAt)
			}
		})
	}
}

func TestOutingContextEditSameIdentityAndPermissions(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	day := time.Now().In(planningZone).AddDate(0, 0, 3).Format("2006-01-02")
	next := time.Now().In(planningZone).AddDate(0, 0, 4).Format("2006-01-02")
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": day, "city": "Bucuresti"})
	contextCall(t, f, p, map[string]any{"date": next, "city": "Iași"}, 1, 403)
	changed := contextCall(t, f, p, map[string]any{"date": next, "city": "Iași"}, 0, 200)
	if changed.ID != p.ID || changed.GroupID != g.ID || changed.OutingDate != next || changed.City != "Iasi" || changed.DecisionRound != p.DecisionRound+1 {
		t.Fatal("context edit created a different outing or kept old state")
	}
	want(t, f.call("POST", "/plans/"+p.ID+"/availability", map[string]any{"date": next, "answer": "yes", "revision": p.Revision}, f.users[1]), 409)
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM outing_plans WHERE group_id=$1`, g.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("context edit duplicated an outing", err)
	}
	old := contextCall(t, f, p, map[string]any{"date": next, "city": "Iași"}, 0, 200)
	if old.Revision != changed.Revision {
		t.Fatal("retry repeated a context edit")
	}
	want(t, f.call("POST", "/plans/"+p.ID+"/reopen", map[string]any{"revision": changed.Revision, "reason": "other"}, f.users[0]), 409)
}

func TestOutingContextEditImpactAndTicketPreservation(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	var day string
	if err := f.pool.QueryRow(context.Background(), `SELECT ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date::text FROM events WHERE id=$1`, f.event).Scan(&day); err != nil {
		t.Fatal(err)
	}
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": day, "city": "Bucuresti"})
	path := "/plans/" + p.ID
	want(t, f.call("POST", path+"/availability", map[string]string{"date": day, "answer": "yes"}, f.users[1]), 200)
	for _, event := range []string{sid(f.event), sid(f.otherEvent)} {
		want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": event}, f.users[0]), 200)
	}
	want(t, f.call("POST", path+"/vote", map[string]string{"eventId": sid(f.event), "answer": "yes"}, f.users[1]), 200)
	want(t, f.call("POST", path+"/choose", map[string]string{"eventId": sid(f.event)}, f.users[0]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	attendanceAs(t, f, p, f.users[1], "yes")
	p = readAs(t, f, p.ID, f.users[0])
	before, _ := messagesAs(t, f, g, f.users[0], "")
	financialSnapshot := func() string {
		t.Helper()
		var value string
		if err := f.pool.QueryRow(context.Background(), `SELECT jsonb_build_object('order',to_jsonb(o),'invoices',COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM billing_invoices i WHERE i.order_id=o.id),'[]'::jsonb))::text FROM orders o WHERE o.id=$1`, f.order).Scan(&value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	beforeFinances := financialSnapshot()
	target, _, err := nightBounds(day)
	if err != nil {
		t.Fatal(err)
	}
	next := target.AddDate(0, 0, 1).Format("2006-01-02")
	payload := map[string]any{"revision": p.Revision, "city": "Bucuresti", "date": next}
	w := f.call("POST", path+"/context", payload, f.users[0])
	want(t, w, 409)
	var notice struct {
		Error  string        `json:"error"`
		Impact contextImpact `json:"impact"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &notice); err != nil {
		t.Fatal(err)
	}
	if notice.Error != "CONTEXT_CONFIRMATION_REQUIRED" || notice.Impact.AvailabilityResponses != 1 || notice.Impact.EventPreferences != 1 || notice.Impact.AttendanceResponses != 1 || notice.Impact.ProposalsIncompatible != 2 || !notice.Impact.DestinationCleared || !notice.Impact.TicketsUnaffected {
		t.Fatalf("incorrect edit impact: %+v", notice)
	}
	if readAs(t, f, p.ID, f.users[0]).Revision != p.Revision {
		t.Fatal("unacknowledged edit changed the outing")
	}
	payload["confirmImpact"] = true
	changed := contextCall(t, f, p, payload, 0, 200)
	if changed.ChosenEventID != "" || changed.OutingDate != next || changed.ConfirmedCount != 0 || len(changed.Options) != 2 {
		t.Fatal("context edit did not clear current destination and answers")
	}
	for _, option := range changed.Options {
		if option.Available || len(option.Reactions) > 0 {
			t.Fatal("incompatible proposal or old preference remained current")
		}
	}
	for _, candidate := range changed.CandidateDates {
		if len(candidate.Responses) > 0 {
			t.Fatal("old night availability copied to new night")
		}
	}
	owner, hash, generation, _ := storedTicket(t, f)
	if owner != f.users[0] || hash != f.initialHash || generation != 0 {
		t.Fatal("editing the outing changed a purchased ticket")
	}
	if financialSnapshot() != beforeFinances {
		t.Fatal("editing the outing changed order status, payment or invoicing records")
	}
	var snapshots, answers int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*),COALESCE(sum(jsonb_array_length(snapshot->'availability')),0) FROM outing_plan_context_history WHERE plan_id=$1`, p.ID).Scan(&snapshots, &answers); err != nil || snapshots != 1 || answers != 1 {
		t.Fatal("previous responses were discarded instead of archived", err)
	}
	after, _ := messagesAs(t, f, g, f.users[0], "")
	if len(after) != len(before)+1 {
		t.Fatal("edit did not produce exactly one compact system message")
	}
	_ = contextCall(t, f, p, payload, 0, 200)
	retry, _ := messagesAs(t, f, g, f.users[0], "")
	if len(retry) != len(after) {
		t.Fatal("retry duplicated the context notification")
	}
}

func TestOutingContextEditConflictAndStableTitle(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	date := time.Now().In(planningZone).AddDate(0, 0, 3)
	a, b := date.Format("2006-01-02"), date.AddDate(0, 0, 1).Format("2006-01-02")
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": a, "city": "Bucuresti"})
	q := createOuting(t, f, g, f.users[1], map[string]any{"date": b, "city": "Bucuresti"})
	w := f.call("POST", "/plans/"+p.ID+"/context", map[string]any{"revision": p.Revision, "date": b, "city": "Bucuresti"}, f.users[0])
	want(t, w, 409)
	var conflict struct{ Error, ExistingPlanID string }
	if err := json.Unmarshal(w.Body.Bytes(), &conflict); err != nil {
		t.Fatal(err)
	}
	if conflict.Error != "OUTING_EXISTS" || conflict.ExistingPlanID != q.ID {
		t.Fatalf("existing outing conflict lost destination: %+v", conflict)
	}
	want(t, f.call("POST", "/plans/"+p.ID+"/availability", map[string]string{"date": a, "answer": "yes"}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	renamed := contextCall(t, f, p, map[string]any{"date": a, "city": "București", "title": "Friday crew"}, 0, 200)
	if renamed.DecisionRound != p.DecisionRound || len(renamed.CandidateDates[0].Responses) != 1 {
		t.Fatal("title or canonical city spelling reset personal responses")
	}
	contextCall(t, f, p, map[string]any{"date": a, "city": "Iasi"}, 0, 409)
	mustExec(t, f.pool, `UPDATE outing_plans SET expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=$1`, p.ID)
	contextCall(t, f, renamed, map[string]any{"date": a, "city": "Iasi", "confirmImpact": true}, 0, 409)
}

func TestOutingContextPollRetainsEligibleProposalWithoutOldPreferences(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	var day string
	if err := f.pool.QueryRow(context.Background(), `SELECT ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date::text FROM events WHERE id=$1`, f.event).Scan(&day); err != nil {
		t.Fatal(err)
	}
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": day, "city": "Bucuresti"})
	want(t, f.call("POST", "/plans/"+p.ID+"/proposals", map[string]string{"eventId": sid(f.event)}, f.users[0]), 200)
	p = readAs(t, f, p.ID, f.users[0])
	start, _, _ := nightBounds(day)
	later := start.AddDate(0, 0, 1).Format("2006-01-02")
	poll := contextCall(t, f, p, map[string]any{"dates": []string{day, later}, "city": "Bucuresti", "confirmImpact": true}, 0, 200)
	if poll.OutingDate != "" || len(poll.CandidateDates) != 2 || poll.Options[0].Available {
		t.Fatal("undecided date context exposes a confirmable proposal")
	}
	want(t, f.call("POST", "/plans/"+p.ID+"/date", map[string]any{"date": day, "revision": poll.Revision}, f.users[0]), 200)
	fixed := readAs(t, f, p.ID, f.users[0])
	if !fixed.Options[0].Available {
		t.Fatal("eligible old proposal could not be reconsidered in the chosen context")
	}
}

func TestOutingContextConcurrentCorrectionsNeverOverwrite(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	date := time.Now().In(planningZone).AddDate(0, 0, 7)
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": date.Format("2006-01-02"), "city": "Bucuresti"})
	var wait sync.WaitGroup
	codes := make(chan int, 2)
	start := make(chan struct{})
	for _, target := range []string{date.AddDate(0, 0, 1).Format("2006-01-02"), date.AddDate(0, 0, 2).Format("2006-01-02")} {
		wait.Add(1)
		go func(day string) {
			defer wait.Done()
			<-start
			codes <- f.call("POST", "/plans/"+p.ID+"/context", map[string]any{"revision": p.Revision, "city": "Bucuresti", "date": day}, f.users[0]).Code
		}(target)
	}
	close(start)
	wait.Wait()
	close(codes)
	success, conflicts := 0, 0
	for code := range codes {
		if code == 200 {
			success++
		} else if code == 409 {
			conflicts++
		} else {
			t.Fatalf("uncontrolled concurrent edit response %d", code)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatal("concurrent context corrections silently overwrote one another")
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM outing_plan_context_history WHERE plan_id=$1`, p.ID).Scan(&count); err != nil || count != 1 {
		t.Fatal("concurrent correction created duplicate context histories", err)
	}
}
