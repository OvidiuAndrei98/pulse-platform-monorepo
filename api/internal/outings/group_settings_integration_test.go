package outings

import (
	"encoding/json"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestGroupListUsesVisibleMessageActivityAcrossDifferentSequences(t *testing.T) {
	f := seed(t)
	first, second := makeGroup(t, f, true), makeGroup(t, f, true)
	send := func(g friendGroup, actor int) {
		want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]string{"requestId": key(t, f), "content": "Activity test"}, f.users[actor]), 201)
	}
	latest := func(expected string) {
		response := f.call("GET", "/groups", nil, f.users[0])
		want(t, response, 200)
		var groups []friendGroup
		if err := json.Unmarshal(response.Body.Bytes(), &groups); err != nil {
			t.Fatal(err)
		}
		if len(groups) < 2 || groups[0].ID != expected || groups[0].ActivityAt.IsZero() || groups[0].ActivityAt.Before(groups[1].ActivityAt) {
			t.Fatal("groups are not ordered by real server activity", groups)
		}
	}
	for range 4 {
		send(first, 0)
	}
	latest(first.ID)
	send(second, 1) // A received seq 1 must sort above another group's seq 4.
	latest(second.ID)
	want(t, f.call("POST", "/groups/"+first.ID+"/actions", map[string]string{"action": "rename", "name": "Renamed without new message"}, f.users[0]), 200)
	latest(second.ID)
	send(first, 0)
	latest(first.ID)

	// A rejoined member sees only their new membership boundary until a new
	// message exists; hidden old messages must not supply its activity timestamp.
	want(t, f.call("POST", "/groups/"+first.ID+"/actions", map[string]string{"action": "remove", "userId": sid(f.users[1])}, f.users[0]), 200)
	want(t, f.call("POST", "/groups/"+first.ID+"/actions", map[string]string{"action": "invite", "userId": sid(f.users[1])}, f.users[0]), 200)
	invited := groupAs(t, f, first, f.users[1])
	ownerView := groupAs(t, f, first, f.users[0])
	if invited.Status != "pending" || invited.ActivityAt.Equal(ownerView.ActivityAt) || invited.Preview != "" {
		t.Fatal("pending membership exposed conversation activity")
	}
	want(t, f.call("POST", "/groups/"+first.ID+"/actions", map[string]string{"action": "accept"}, f.users[1]), 200)
	joined := groupAs(t, f, first, f.users[1])
	if joined.JoinedAt == nil || !joined.ActivityAt.Equal(*joined.JoinedAt) || joined.Preview != "" {
		t.Fatal("new membership activity used hidden message history")
	}
}

func TestSelectedNightCatalogLoadsKnownOccurrenceAndDoesNotSubstituteAnotherNight(t *testing.T) {
	f := seed(t)
	if !validPlanningDate("2026-11-26", time.Now()) {
		t.Skip("captured public event scenario is now historical")
	}
	start, _ := time.Parse(time.RFC3339, "2026-11-26T18:00:00Z")
	end, _ := time.Parse(time.RFC3339, "2026-11-30T11:28:00Z")
	mustExec(t, f.pool, `UPDATE events SET title='ROOF TOP',city='Bucuresti',start_time=$2,end_time=$3 WHERE id=$1`, f.event, start, end)
	params := url.Values{"nightDate": {"2026-11-26"}, "city": {"București"}, "q": {""}, "page": {"1"}}
	found := false
	for _, event := range catalogAs(t, f, params) {
		found = found || event.ID == sid(f.event)
	}
	if !found {
		t.Fatal("blank proposal search lost the known eligible occurrence")
	}
	params.Set("nightDate", "2026-11-25")
	for _, event := range catalogAs(t, f, params) {
		if event.ID == sid(f.event) {
			t.Fatal("a different night's event was relabelled as eligible")
		}
	}
}

// Real authenticated handler requests backed by the isolated PostgreSQL fixture.
// These are not writes to a user's group or to the configured remote API.
func TestGroupSettingsSaveEighteenthToTwentyFifthDistinguishesPermissions(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, true)
	from, to := "2026-11-18", "2026-11-25"
	if !validPlanningDate(from, time.Now()) {
		t.Skip("the captured 18 November scenario is now historical")
	}
	// Accepted member 1 initiates the outing; group administrator 0 does not
	// become its coordinator merely by administering the permanent group.
	p := createOuting(t, f, g, f.users[1], map[string]any{"date": from, "city": "Bucuresti"})
	path := "/plans/" + p.ID + "/context"
	payload := map[string]any{"revision": p.Revision, "date": to, "city": "București"}
	denied := f.call("POST", path, payload, f.users[0])
	want(t, denied, 403)
	if !strings.Contains(denied.Body.String(), "OUTING_EDIT_FORBIDDEN") {
		t.Fatal("a coordinator refusal was disguised as lost group membership", denied.Body.String())
	}
	groupAs(t, f, g, f.users[0])
	t.Logf("POST %s status=403 code=OUTING_EDIT_FORBIDDEN actorRole=group_admin groupId=%s outingId=%s", path, g.ID, p.ID)

	wrongID := f.call("POST", "/plans/"+g.ID+"/context", payload, f.users[1])
	want(t, wrongID, 404)
	groupAs(t, f, g, f.users[1])
	if got := readAs(t, f, p.ID, f.users[1]); got.OutingDate != from {
		t.Fatal("a failed edit changed the saved date")
	}
	t.Logf("POST /plans/%s/context status=404 code=NOT_FOUND cause=group_id_used_as_outing_id membership=accepted", g.ID)

	saved := f.call("POST", path, payload, f.users[1])
	want(t, saved, 200)
	var after plan
	if err := json.Unmarshal(saved.Body.Bytes(), &after); err != nil {
		t.Fatal(err)
	}
	if after.ID != p.ID || after.GroupID != g.ID || after.OutingDate != to || after.City != "Bucuresti" {
		t.Fatal("18 to 25 was not saved atomically on the same outing", after)
	}
	t.Logf("POST %s status=200 actorRole=outing_coordinator groupId=%s outingId=%s date=%s", path, g.ID, after.ID, after.OutingDate)

	// Removal really revokes this person's conversation access. The old outing
	// reference must not bypass membership even with a previously valid revision.
	want(t, f.call("POST", "/groups/"+g.ID+"/actions", map[string]string{"action": "remove", "userId": sid(f.users[1])}, f.users[0]), 200)
	want(t, f.call("POST", path, map[string]any{"revision": after.Revision, "date": to, "city": "Bucuresti"}, f.users[1]), 404)
	revoked := f.call("GET", "/groups/"+g.ID, nil, f.users[1])
	want(t, revoked, 404)
	if !strings.Contains(revoked.Body.String(), "GROUP_ACCESS_LOST") {
		t.Fatal("canonical membership read did not identify actual access loss", revoked.Body.String())
	}
}

func TestGroupSettingsPendingAndAdminActionsHaveDifferentAuthority(t *testing.T) {
	f := seed(t)
	g := makeGroup(t, f, false)
	day := time.Now().In(planningZone).AddDate(0, 0, 3).Format("2006-01-02")
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": day, "city": "Bucuresti"})
	want(t, f.call("POST", "/plans/"+p.ID+"/context", map[string]any{"revision": p.Revision, "date": day, "city": "Bucuresti"}, f.users[1]), 404)
	if pending := groupAs(t, f, g, f.users[1]); pending.Status != "pending" || len(pending.Outings) != 0 {
		t.Fatal("a pending invitation exposed an outing")
	}
	want(t, f.call("POST", "/groups/"+g.ID+"/actions", map[string]string{"action": "accept"}, f.users[1]), 200)
	for _, action := range []map[string]string{
		{"action": "rename", "name": "Not administrator"},
		{"action": "invite", "userId": sid(f.users[2])},
		{"action": "remove", "userId": sid(f.users[0])},
		{"action": "transfer-admin", "userId": sid(f.users[1])},
	} {
		response := f.call("POST", "/groups/"+g.ID+"/actions", action, f.users[1])
		want(t, response, 403)
		if !strings.Contains(response.Body.String(), "GROUP_ADMIN_REQUIRED") {
			t.Fatal("an administrator refusal was disguised as group removal", response.Body.String())
		}
	}
	groupAs(t, f, g, f.users[1])
}
