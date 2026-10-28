package events

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func seedWardrobeDeletionFixture(t *testing.T, pool *pgxpool.Pool) (ownershipFixture, pgtype.UUID, pgtype.UUID) {
	t.Helper()
	f := seedOwnershipFixture(t, pool)
	ctx := context.Background()
	t.Cleanup(func() {
		for _, table := range []string{"wardrobe_audit", "wardrobe_deposits", "wardrobe_staff", "wardrobe_zones"} {
			if _, err := pool.Exec(ctx, "DELETE FROM "+table+" WHERE event_id=$1", f.eventID); err != nil {
				t.Error(err)
			}
		}
	})
	var zone, slot pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO wardrobe_zones(event_id,name,prefix,kind,capacity) VALUES($1,'Desk','A','any',1) RETURNING id`, f.eventID).Scan(&zone); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO wardrobe_slots(zone_id,number) VALUES($1,1) RETURNING id`, zone).Scan(&slot); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wardrobe_staff(event_id,user_id,role) VALUES($1,$2,'operator')`, f.eventID, f.otherOwnerID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO wardrobe_audit(event_id,actor_id,action) VALUES($1,$2,'zone')`, f.eventID, f.ownerID); err != nil {
		t.Fatal(err)
	}
	return f, zone, slot
}

func deleteWardrobeEvent(h *Handler, f ownershipFixture) *httptest.ResponseRecorder {
	r := httptest.NewRequest("DELETE", "/dashboard/events/"+f.eventID.String(), nil)
	route := chi.NewRouteContext()
	route.URLParams.Add("id", f.eventID.String())
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, auth.UserIDKey, f.ownerID.String())
	w := httptest.NewRecorder()
	h.HandleDeleteEvent(w, r.WithContext(ctx))
	return w
}

const wardrobeDeletionDepositSQL = `INSERT INTO wardrobe_deposits(event_id,user_id,zone_id,slot_id,request_id,request_hash,status,items,remaining)
VALUES($1,$2,$3,$4,gen_random_uuid(),'deletion-test',$5,'{"coat":1,"bag":0,"backpack":0}',
 CASE WHEN $5='returned' THEN '{"coat":0,"bag":0,"backpack":0}'::jsonb ELSE '{"coat":1,"bag":0,"backpack":0}'::jsonb END)`

func TestEventDeletionAllowsUnusedWardrobeAndPreservesAllCustodyHistory(t *testing.T) {
	for _, status := range []string{"setup_only", "reserved", "stored", "returned", "cancelled"} {
		t.Run(status, func(t *testing.T) {
			pool := isolationTestPool(t)
			f, zone, slot := seedWardrobeDeletionFixture(t, pool)
			ctx := context.Background()
			if status != "setup_only" {
				if _, err := pool.Exec(ctx, wardrobeDeletionDepositSQL, f.eventID, f.otherOwnerID, zone, slot, status); err != nil {
					t.Fatal(err)
				}
			}
			w := deleteWardrobeEvent(NewHandler(db.New(pool), pool), f)
			if status == "setup_only" {
				if w.Code != 204 {
					t.Fatalf("setup-only event deletion returned %d: %s", w.Code, w.Body.String())
				}
				var count int
				if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM events WHERE id=$1)+(SELECT count(*) FROM wardrobe_zones WHERE event_id=$1)+(SELECT count(*) FROM wardrobe_slots WHERE zone_id=$2)+(SELECT count(*) FROM wardrobe_staff WHERE event_id=$1)+(SELECT count(*) FROM wardrobe_audit WHERE event_id=$1)`, f.eventID, zone).Scan(&count); err != nil || count != 0 {
					t.Fatalf("unused cloakroom was not fully removed: count=%d err=%v", count, err)
				}
			} else {
				if w.Code != 409 || !strings.Contains(w.Body.String(), "garderoba") {
					t.Fatalf("custody event deletion returned %d: %s", w.Code, w.Body.String())
				}
				var count int
				if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM events WHERE id=$1)+(SELECT count(*) FROM wardrobe_zones WHERE event_id=$1)+(SELECT count(*) FROM wardrobe_slots WHERE zone_id=$2)+(SELECT count(*) FROM wardrobe_staff WHERE event_id=$1)+(SELECT count(*) FROM wardrobe_audit WHERE event_id=$1)+(SELECT count(*) FROM wardrobe_deposits WHERE event_id=$1 AND status=$3)`, f.eventID, zone, status).Scan(&count); err != nil || count != 6 {
					t.Fatalf("blocked deletion changed custody/setup: count=%d err=%v", count, err)
				}
			}
		})
	}
}

func TestEventDeletionSeesDepositCommittedWhileWaitingForEventLock(t *testing.T) {
	pool := isolationTestPool(t)
	f, zone, slot := seedWardrobeDeletionFixture(t, pool)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	var locked pgtype.UUID
	if err = tx.QueryRow(ctx, `SELECT id FROM events WHERE id=$1 FOR UPDATE`, f.eventID).Scan(&locked); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, wardrobeDeletionDepositSQL, f.eventID, f.otherOwnerID, zone, slot, "reserved"); err != nil {
		t.Fatal(err)
	}
	response := make(chan *httptest.ResponseRecorder, 1)
	go func() { response <- deleteWardrobeEvent(NewHandler(db.New(pool), pool), f) }()
	blocked := false
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if err = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock')`, tx.Conn().PgConn().PID()).Scan(&blocked); err != nil {
			t.Fatal(err)
		}
		if blocked {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !blocked {
		t.Fatal("event deletion did not wait for the cloakroom allocation")
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case w := <-response:
		if w.Code != 409 || !strings.Contains(w.Body.String(), "garderoba") {
			t.Fatalf("concurrent allocation was missed: status=%d body=%s", w.Code, w.Body.String())
		}
	case <-ctx.Done():
		t.Fatal("event deletion did not finish after allocation committed")
	}
}
