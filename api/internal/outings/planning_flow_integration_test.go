package outings

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

func planningDraft(t *testing.T, f fixture) createPlanRequest {
	t.Helper()
	var day string
	if err := f.pool.QueryRow(context.Background(), `SELECT ((start_time AT TIME ZONE 'Europe/Bucharest')-interval '6 hours')::date::text FROM events WHERE id=$1`, f.event).Scan(&day); err != nil {
		t.Fatal(err)
	}
	return createPlanRequest{RequestID: key(t, f), Title: "Saturday together", OutingDate: day, City: "Bucuresti", FriendIDs: []string{sid(f.users[1])}}
}
func createEmptyPlan(t *testing.T, f fixture) plan {
	t.Helper()
	w := f.call("POST", "/plans", planningDraft(t, f), f.users[0])
	want(t, w, 201)
	var p plan
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	if len(p.Options) != 0 || p.City != "Bucuresti" || p.OutingDate == "" {
		t.Fatal("planning context or empty proposals lost")
	}
	return p
}
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
func TestPlanningContextPrivacyAndAcceptedProposals(t *testing.T) {
	f := seed(t)
	p := createEmptyPlan(t, f)
	path := "/plans/" + p.ID
	pending := readAs(t, f, p.ID, f.users[1])
	if pending.ChosenEventID != "" || len(pending.Members) != 0 || len(pending.Options) != 0 {
		t.Fatal("pending invitation exposed private group")
	}
	proposal := map[string]string{"eventId": sid(f.event)}
	want(t, f.call("POST", path+"/proposals", proposal, f.users[1]), 404)
	want(t, f.call("POST", path+"/proposals", proposal, f.users[2]), 404)
	want(t, f.call("POST", path+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 200)
	var wg sync.WaitGroup
	for range 6 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := f.call("POST", path+"/proposals", proposal, f.users[1])
			if w.Code != 200 {
				t.Errorf("duplicate proposal: %d %s", w.Code, w.Body.String())
			}
		}()
	}
	wg.Wait()
	p = readAs(t, f, p.ID, f.users[0])
	if len(p.Options) != 1 || p.Options[0].ProposedBy != sid(f.users[1]) {
		t.Fatal("proposal retry duplicated or attributed incorrectly")
	}
	if p.Options[0].PriceRon == nil || *p.Options[0].PriceRon != 50 || p.Options[0].TicketAvailability != "on_sale" {
		t.Fatal("ticket pricing is not server derived")
	}
	mustExec(t, f.pool, `UPDATE events SET city='Iasi' WHERE id=$1`, f.otherEvent)
	want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(f.otherEvent)}, f.users[0]), 409)
	mustExec(t, f.pool, `UPDATE events SET city='Bucuresti',start_time=start_time+interval '2 days',end_time=end_time+interval '2 days' WHERE id=$1`, f.otherEvent)
	want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(f.otherEvent)}, f.users[0]), 409)
	mustExec(t, f.pool, `UPDATE events SET status='cancelled' WHERE id=$1`, f.event)
	want(t, f.call("POST", path+"/vote", proposal, f.users[1]), 409)
}
func TestPlanningDateValidationFutureLifetimeAndRequestBinding(t *testing.T) {
	f := seed(t)
	for _, day := range []string{"2026-02-30", time.Now().In(planningZone).AddDate(0, 0, -1).Format("2006-01-02"), time.Now().In(planningZone).AddDate(0, 0, 366).Format("2006-01-02")} {
		draft := planningDraft(t, f)
		draft.OutingDate = day
		want(t, f.call("POST", "/plans", draft, f.users[0]), 400)
	}
	draft := planningDraft(t, f)
	draft.City = "untrusted city"
	want(t, f.call("POST", "/plans", draft, f.users[0]), 400)
	draft.City = "Bucuresti"
	draft.OutingDate = time.Now().In(planningZone).AddDate(0, 0, 100).Format("2006-01-02")
	w := f.call("POST", "/plans", draft, f.users[0])
	want(t, w, 201)
	var p plan
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	if !p.ExpiresAt.After(time.Now().Add(99 * 24 * time.Hour)) {
		t.Fatal("future outing expires using old 30 day TTL")
	}
	want(t, f.call("POST", "/plans", draft, f.users[0]), 200)
	draft.Title = "Different payload"
	want(t, f.call("POST", "/plans", draft, f.users[0]), 409)
}
func TestChosenOutingNotificationAndCurrentHolderRights(t *testing.T) {
	f := seed(t)
	p := createEmptyPlan(t, f)
	path := "/plans/" + p.ID
	want(t, f.call("POST", path+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 200)
	choice := map[string]string{"eventId": sid(f.event)}
	want(t, f.call("POST", path+"/proposals", choice, f.users[1]), 200)
	want(t, f.call("POST", path+"/choose", choice, f.users[1]), 404)
	var wg sync.WaitGroup
	for range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := f.call("POST", path+"/choose", choice, f.users[0])
			if w.Code != 200 {
				t.Errorf("choose retry: %d", w.Code)
			}
		}()
	}
	wg.Wait()
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM notifications WHERE type='outing_plan_chosen' AND event_id=$1`, f.event).Scan(&count); err != nil || count != 2 {
		t.Fatalf("duplicate notifications: %d %v", count, err)
	}
	p = readAs(t, f, p.ID, f.users[0])
	entitlement := func(p plan, user pgtype.UUID) bool {
		for _, member := range p.Members {
			if member.UserID == sid(user) {
				return member.HasTicket != nil && *member.HasTicket
			}
		}
		return false
	}
	if !entitlement(p, f.users[0]) || entitlement(p, f.users[1]) {
		t.Fatal("ticket ownership inferred from plan membership")
	}
	invitation := createInvitation(t, f)
	want(t, f.call("POST", "/transfers/"+invitation.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 200)
	p = readAs(t, f, p.ID, f.users[1])
	if entitlement(p, f.users[0]) || !entitlement(p, f.users[1]) {
		t.Fatal("planning rights did not follow current holder")
	}
	mustExec(t, f.pool, `UPDATE orders SET stripe_amount_refunded_bani=1 WHERE id=$1`, f.order)
	p = readAs(t, f, p.ID, f.users[1])
	if entitlement(p, f.users[1]) {
		t.Fatal("refunded admission still grants preparation")
	}
	want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(f.otherEvent)}, f.users[1]), 409)
}
func TestProposalLimitAndLiveAvailability(t *testing.T) {
	f := seed(t)
	p := createEmptyPlan(t, f)
	path := "/plans/" + p.ID
	ids := []pgtype.UUID{f.event}
	for i := range 8 {
		id := rowID(t, f.pool, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status)
          SELECT organizer_id,$2,category,location_name,city,vibe,latitude,longitude,start_time,end_time,$2,'published' FROM events WHERE id=$1 RETURNING id`, f.event, fmt.Sprintf("proposal-%d-%d", time.Now().UnixNano(), i))
		ids = append(ids, id)
	}
	t.Cleanup(func() { mustExec(t, f.pool, `DELETE FROM events WHERE id=ANY($1)`, ids[1:]) })
	for i, id := range ids {
		status := 200
		if i == 8 {
			status = 409
		}
		want(t, f.call("POST", path+"/proposals", map[string]string{"eventId": sid(id)}, f.users[0]), status)
	}
	mustExec(t, f.pool, `UPDATE ticket_types SET capacity=tickets_sold WHERE id=$1`, f.tier)
	p = readAs(t, f, p.ID, f.users[0])
	if p.Options[0].TicketAvailability != "sold_out" {
		t.Fatal("sold out availability missing")
	}
	mustExec(t, f.pool, `UPDATE ticket_types SET capacity=100,start_sales=now()+interval '1 hour' WHERE id=$1`, f.tier)
	p = readAs(t, f, p.ID, f.users[0])
	if p.Options[0].TicketAvailability != "upcoming" {
		t.Fatal("future sales missing")
	}
	mustExec(t, f.pool, `UPDATE ticket_types SET start_sales=now()-interval '2 days',end_sales=now()-interval '1 hour' WHERE id=$1`, f.tier)
	p = readAs(t, f, p.ID, f.users[0])
	if p.Options[0].TicketAvailability != "sales_ended" {
		t.Fatal("ended sales missing")
	}
}
