package wardrobe

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"testing"
	"time"
)

type unclaimedOverview struct {
	EventEnded                     bool
	UnclaimedCount, UnclaimedItems int
	Deposits                       []receipt
	NextCursor                     string
}

func readUnclaimed(t *testing.T, f *fixture, actor, query string) unclaimedOverview {
	t.Helper()
	w := f.request(actor, "GET", "/events/"+f.event+"?unclaimed=true"+query, nil)
	if w.Code != 200 {
		t.Fatalf("unclaimed overview: %d %s", w.Code, w.Body.String())
	}
	var result unclaimedOverview
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestUnclaimedUsesEventEndAndStoredRemainingOnly(t *testing.T) {
	f := seed(t)
	ctx := context.Background()
	old := time.Now().Add(-48 * time.Hour)
	retentionDeposit(t, f, "returned", old)
	retentionDeposit(t, f, "cancelled", old)
	stored := retentionDeposit(t, f, "stored", old) // only the bag remains
	retentionDeposit(t, f, "reserved", time.Now().Add(time.Hour))
	for _, status := range []string{"published", "draft"} {
		if _, err := f.pool.Exec(ctx, `UPDATE events SET status=$2 WHERE id=$1::uuid`, f.event, status); err != nil {
			t.Fatal(err)
		}
		result := readUnclaimed(t, f, f.owner, "")
		if result.EventEnded || result.UnclaimedCount != 0 || len(result.Deposits) != 0 {
			t.Fatalf("future %s event marked unclaimed: %+v", status, result)
		}
	}
	setRetentionEventEnd(t, f, time.Now().Add(-time.Hour))
	for _, actor := range []string{f.owner, f.staff, f.supervisor} {
		result := readUnclaimed(t, f, actor, "")
		if !result.EventEnded || result.UnclaimedCount != 1 || result.UnclaimedItems != 1 || len(result.Deposits) != 1 || result.Deposits[0].ID != stored || result.Deposits[0].Remaining != (Items{Bag: 1}) {
			t.Fatalf("wrong unclaimed result: %+v", result)
		}
	}
	// Search and pagination never turn the summary into a count of just one page.
	filtered := readUnclaimed(t, f, f.owner, "&q=absent-customer")
	if filtered.UnclaimedCount != 1 || filtered.UnclaimedItems != 1 || len(filtered.Deposits) != 0 {
		t.Fatalf("summary depends on search: %+v", filtered)
	}
	for _, actor := range []string{f.customer, f.outsider} {
		w := f.request(actor, "GET", "/events/"+f.event+"?unclaimed=true", nil)
		if w.Code != 403 {
			t.Fatalf("unclaimed data leaked to outsider: %d", w.Code)
		}
	}
	// Existing recovery permissions and handover flow work from this list.
	d := f.get(t, stored)
	f.cmd(t, f.staff, Command{Action: "recover", DepositID: stored, Revision: d.Revision, Items: Items{Bag: 1}, Reason: "Verified ownership at desk"}, 403)
	f.cmd(t, f.supervisor, Command{Action: "recover", DepositID: stored, Revision: d.Revision, Items: Items{Bag: 1}, Reason: "Verified ownership at desk"}, 200)
	result := readUnclaimed(t, f, f.owner, "")
	if result.UnclaimedCount != 0 || result.UnclaimedItems != 0 || len(result.Deposits) != 0 {
		t.Fatalf("returned item still unclaimed: %+v", result)
	}
}

func TestUnclaimedOldestFirstPaginationAndSearch(t *testing.T) {
	f := seed(t)
	ctx := context.Background()
	base := time.Now().UTC().Add(-6 * 24 * time.Hour).Truncate(time.Second)
	if _, err := f.pool.Exec(ctx, `UPDATE wardrobe_zones SET capacity=70 WHERE id=$1::uuid`, f.zone); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `INSERT INTO wardrobe_slots(zone_id,number) SELECT $1::uuid,generate_series(3,70)`, f.zone); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `INSERT INTO wardrobe_deposits(event_id,user_id,zone_id,slot_id,request_id,request_hash,status,items,remaining,created_at,stored_at)
 SELECT $1::uuid,$2::uuid,$3::uuid,s.id,gen_random_uuid(),'unclaimed-test','stored','{"coat":1,"bag":1,"backpack":0}','{"coat":0,"bag":1,"backpack":0}',
 $4::timestamptz-interval '1 hour',CASE WHEN s.number=1 THEN NULL ELSE $4::timestamptz+s.number*interval '1 hour' END
 FROM wardrobe_slots s WHERE s.zone_id=$3::uuid AND s.number<=65`, f.event, f.customer, f.zone, base); err != nil {
		t.Fatal(err)
	}
	setRetentionEventEnd(t, f, time.Now().Add(-time.Hour))
	first := readUnclaimed(t, f, f.owner, "")
	if len(first.Deposits) != 60 || first.NextCursor == "" || first.UnclaimedCount != 65 || first.UnclaimedItems != 65 {
		t.Fatalf("bad first page: %+v", first)
	}
	second := readUnclaimed(t, f, f.owner, "&before="+first.NextCursor)
	if len(second.Deposits) != 5 || second.NextCursor != "" || second.UnclaimedCount != 65 {
		t.Fatalf("bad second page: %+v", second)
	}
	for i, d := range append(first.Deposits, second.Deposits...) {
		if d.Number != fmt.Sprintf("A%03d", i+1) {
			t.Errorf("oldest-first order %d: %s", i, d.Number)
		}
	}
	searched := readUnclaimed(t, f, f.owner, "&q="+url.QueryEscape("A065"))
	if len(searched.Deposits) != 1 || searched.Deposits[0].Number != "A065" || searched.UnclaimedCount != 65 {
		t.Fatalf("search broken: %+v", searched)
	}
	// History and unclaimed are mutually exclusive; unclaimed wins for old links
	// carrying both flags and still returns only property physically held.
	both := readUnclaimed(t, f, f.owner, "&history=true")
	if len(both.Deposits) != 60 {
		t.Fatal("history flag overrode unclaimed filter")
	}
	// Ties must use the UUID as a stable second key across page boundaries.
	if _, err := f.pool.Exec(ctx, `UPDATE wardrobe_deposits SET stored_at=$2 WHERE event_id=$1::uuid`, f.event, base); err != nil {
		t.Fatal(err)
	}
	first = readUnclaimed(t, f, f.owner, "")
	second = readUnclaimed(t, f, f.owner, "&before="+first.NextCursor)
	seen := map[string]bool{}
	for _, d := range append(first.Deposits, second.Deposits...) {
		if seen[d.ID] {
			t.Fatal("duplicate across tied pages")
		}
		seen[d.ID] = true
	}
	if len(seen) != 65 {
		t.Fatalf("lost tied deposits: %d", len(seen))
	}
}
