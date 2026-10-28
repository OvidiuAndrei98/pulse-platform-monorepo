package wardrobe

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func setRetentionEventEnd(t *testing.T, f *fixture, end time.Time) {
	t.Helper()
	if _, err := f.pool.Exec(context.Background(), `UPDATE events SET start_time=$2::timestamptz-interval '4 hours',end_time=$2 WHERE id=$1::uuid`, f.event, end); err != nil {
		t.Fatal(err)
	}
}

func retentionDeposit(t *testing.T, f *fixture, status string, resolved time.Time) string {
	t.Helper()
	ctx := context.Background()
	id := uuid()
	_, err := f.pool.Exec(ctx, `INSERT INTO wardrobe_deposits(id,event_id,user_id,zone_id,slot_id,request_id,request_hash,status,items,remaining,created_at,reserved_until,returned_at)
 SELECT $1::uuid,$2::uuid,$3::uuid,$4::uuid,s.id,gen_random_uuid(),'retention-fixture',$5,
 '{"coat":1,"bag":1,"backpack":0}',
 CASE WHEN $5='returned' THEN '{"coat":0,"bag":0,"backpack":0}'::jsonb ELSE '{"coat":0,"bag":1,"backpack":0}'::jsonb END,
 $6::timestamptz-interval '1 hour',$6,CASE WHEN $5='returned' THEN $6::timestamptz ELSE NULL END
 FROM wardrobe_slots s WHERE s.zone_id=$4::uuid
 AND NOT EXISTS(SELECT 1 FROM wardrobe_deposits d WHERE d.slot_id=s.id AND d.status IN ('reserved','stored'))
 ORDER BY s.number LIMIT 1`, id, f.event, f.customer, f.zone, status, resolved)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, `INSERT INTO wardrobe_audit(event_id,deposit_id,actor_id,action) VALUES($1::uuid,$2::uuid,$3::uuid,'retention-fixture')`, f.event, id, f.staff); err != nil {
		t.Fatal(err)
	}
	return id
}

func countRetentionRows(t *testing.T, f *fixture, table, column, id string) int {
	t.Helper()
	var count int
	// All identifiers are fixed test constants; only UUID values vary.
	if err := f.pool.QueryRow(context.Background(), "SELECT count(*) FROM "+table+" WHERE "+column+"=$1::uuid", id).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestRetentionSevenDayBoundaryAndCompleteCleanup(t *testing.T) {
	f := seed(t)
	ctx := context.Background()
	cutoff := time.Now().UTC().Add(-retentionPeriod).Truncate(time.Second)
	setRetentionEventEnd(t, f, cutoff.Add(time.Second))
	retentionDeposit(t, f, "returned", cutoff.Add(-time.Hour))
	if result, err := f.h.cleanupExpired(ctx, cutoff); err != nil || result.Events != 0 {
		t.Fatalf("deleted before seven full days: %+v %v", result, err)
	}
	setRetentionEventEnd(t, f, cutoff)
	if result, err := f.h.cleanupExpired(ctx, cutoff); err != nil || result.Deposits != 1 {
		t.Fatalf("boundary cleanup: %+v %v", result, err)
	}
	for _, table := range []string{"wardrobe_deposits", "wardrobe_audit", "wardrobe_zones", "wardrobe_staff"} {
		if n := countRetentionRows(t, f, table, "event_id", f.event); n != 0 {
			t.Errorf("retained %d %s rows", n, table)
		}
	}
	if countRetentionRows(t, f, "wardrobe_slots", "zone_id", f.zone) != 0 || countRetentionRows(t, f, "events", "id", f.event) != 1 || countRetentionRows(t, f, "users", "id", f.customer) != 1 {
		t.Fatal("must remove places but preserve the event and customer account")
	}
	if result, err := f.h.cleanupExpired(ctx, cutoff); err != nil || result.Events != 0 {
		t.Fatalf("repeat cleanup must be a no-op: %+v %v", result, err)
	}
}

func TestRetentionPreservesUnclaimedPartialDepositsAndTheirAudit(t *testing.T) {
	f := seed(t)
	ctx := context.Background()
	cutoff := time.Now().UTC().Add(-retentionPeriod).Truncate(time.Second)
	setRetentionEventEnd(t, f, cutoff.Add(-time.Hour))
	// Extra physical places for both an old and a still-valid reservation.
	if _, err := f.pool.Exec(ctx, `UPDATE wardrobe_zones SET capacity=10 WHERE id=$1::uuid`, f.zone); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `INSERT INTO wardrobe_slots(zone_id,number) SELECT $1::uuid,generate_series(3,10)`, f.zone); err != nil {
		t.Fatal(err)
	}
	old := cutoff.Add(-time.Hour)
	removed := []string{retentionDeposit(t, f, "returned", old), retentionDeposit(t, f, "cancelled", old), retentionDeposit(t, f, "reserved", old)}
	kept := []string{retentionDeposit(t, f, "stored", old), retentionDeposit(t, f, "reserved", time.Now().Add(time.Hour)), retentionDeposit(t, f, "returned", cutoff.Add(time.Second))}
	if result, err := f.h.cleanupExpired(ctx, cutoff); err != nil || result.Deposits != 3 {
		t.Fatalf("mixed cleanup: %+v %v", result, err)
	}
	for _, id := range removed {
		if countRetentionRows(t, f, "wardrobe_deposits", "id", id) != 0 || countRetentionRows(t, f, "wardrobe_audit", "deposit_id", id) != 0 {
			t.Error("resolved deposit or its audit remains", id)
		}
	}
	for _, id := range kept {
		if countRetentionRows(t, f, "wardrobe_deposits", "id", id) != 1 || countRetentionRows(t, f, "wardrobe_audit", "deposit_id", id) != 1 {
			t.Error("active/recent deposit or its audit was removed", id)
		}
	}
	if countRetentionRows(t, f, "wardrobe_staff", "event_id", f.event) != 2 || countRetentionRows(t, f, "wardrobe_slots", "zone_id", f.zone) != 10 {
		t.Fatal("unclaimed items lost their team or place map")
	}
	var remaining Items
	var raw []byte
	if err := f.pool.QueryRow(ctx, `SELECT remaining FROM wardrobe_deposits WHERE id=$1::uuid`, kept[0]).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	// The stored fixture is a partial return; even its single remaining bag survives.
	if err := json.Unmarshal(raw, &remaining); err != nil || remaining != (Items{Bag: 1}) {
		t.Fatalf("remaining belongings changed: %s (%v)", raw, err)
	}
	if result, err := f.h.cleanupExpired(ctx, cutoff); err != nil || result.Events != 0 {
		t.Fatalf("active/recent events should not repeatedly consume batches: %+v %v", result, err)
	}
}

func TestRetentionLateHandoverGetsSevenDaysAndSetupOnlyCanExpire(t *testing.T) {
	for _, setupOnly := range []bool{false, true} {
		t.Run(map[bool]string{false: "late handover", true: "setup only"}[setupOnly], func(t *testing.T) {
			f := seed(t)
			ctx := context.Background()
			cutoff := time.Now().UTC().Add(-retentionPeriod).Truncate(time.Second)
			setRetentionEventEnd(t, f, cutoff.Add(-24*time.Hour))
			if !setupOnly {
				retentionDeposit(t, f, "returned", cutoff.Add(time.Second))
				if result, err := f.h.cleanupExpired(ctx, cutoff); err != nil || result.Events != 0 {
					t.Fatalf("late handover deleted early: %+v %v", result, err)
				}
			}
			if result, err := f.h.cleanupExpired(ctx, cutoff.Add(time.Second)); err != nil || result.Events != 1 {
				t.Fatalf("cleanup: %+v %v", result, err)
			}
			f.cmd(t, f.owner, Command{Action: "zone", Name: "Must not disappear", Prefix: "B", Kind: "any", Capacity: 1, Enabled: true}, 409)
			f.cmd(t, f.owner, Command{Action: "staff", Email: f.staff + "@example.invalid", Role: "operator"}, 409)
			// Reprogramming the event restores the ability to configure its cloakroom.
			setRetentionEventEnd(t, f, time.Now().Add(24*time.Hour))
			f.cmd(t, f.owner, Command{Action: "zone", Name: "Reopened", Prefix: "B", Kind: "any", Capacity: 1, Enabled: true}, 200)
		})
	}
}

func TestRetentionSkipsLockedEventsAndObservesRescheduling(t *testing.T) {
	f := seed(t)
	ctx := context.Background()
	cutoff := time.Now().UTC().Add(-retentionPeriod)
	setRetentionEventEnd(t, f, cutoff.Add(-time.Hour))
	retentionDeposit(t, f, "returned", cutoff.Add(-time.Hour))
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT id FROM events WHERE id=$1::uuid FOR UPDATE`, f.event); err != nil {
		t.Fatal(err)
	}
	job, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	if result, err := f.h.cleanupExpired(job, cutoff); err != nil || result.Events != 0 {
		t.Fatalf("cleanup blocked on a live operation: %+v %v", result, err)
	}
	if _, err = tx.Exec(ctx, `UPDATE events SET end_time=now()+interval '1 day' WHERE id=$1::uuid`, f.event); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	if result, err := f.h.cleanupExpired(ctx, cutoff); err != nil || result.Events != 0 {
		t.Fatalf("rescheduled event was cleaned: %+v %v", result, err)
	}
}

func TestRetentionConcurrentWorkersDoNotDeleteActiveCustody(t *testing.T) {
	f := seed(t)
	ctx := context.Background()
	cutoff := time.Now().UTC().Add(-retentionPeriod)
	setRetentionEventEnd(t, f, cutoff.Add(-time.Hour))
	retentionDeposit(t, f, "returned", cutoff.Add(-time.Hour))
	active := retentionDeposit(t, f, "stored", cutoff.Add(-time.Hour))
	var wg sync.WaitGroup
	var mu sync.Mutex
	var removed int64
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, err := f.h.cleanupExpired(ctx, cutoff)
			if err != nil {
				t.Error(err)
			}
			mu.Lock()
			removed += r.Deposits
			mu.Unlock()
		}()
	}
	wg.Wait()
	if removed != 1 || countRetentionRows(t, f, "wardrobe_deposits", "id", active) != 1 {
		t.Fatalf("concurrent cleanup changed custody: deleted %d", removed)
	}
}
