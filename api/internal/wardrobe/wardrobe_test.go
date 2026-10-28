package wardrobe

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"pulse-api/internal/auth"
)

func uuid() string {
	var id pgtype.UUID
	_, _ = rand.Read(id.Bytes[:])
	id.Valid = true
	return id.String()
}

type fixture struct {
	h                                                                *Handler
	pool                                                             *pgxpool.Pool
	owner, staff, supervisor, customer, other, outsider, event, zone string
}

func seed(t *testing.T) *fixture {
	t.Helper()
	dsn := os.Getenv("ISOLATION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set ISOLATION_TEST_DATABASE_URL to the migrated local spottr_security_test")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated test database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	f := &fixture{pool: pool, h: &Handler{Pool: pool}, owner: uuid(), staff: uuid(), supervisor: uuid(), customer: uuid(), other: uuid(), outsider: uuid(), event: uuid()}
	ctx := context.Background()
	for _, id := range []string{f.owner, f.staff, f.supervisor, f.customer, f.other, f.outsider} {
		_, err = pool.Exec(ctx, `INSERT INTO users(id,username,email,password_hash,role,is_active) VALUES($1::uuid,$2,$3,'unused','user',true)`, id, "wardrobe-"+id, id+"@example.invalid")
		if err != nil {
			t.Fatal(err)
		}
	}
	_, err = pool.Exec(ctx, `INSERT INTO events(id,organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,status) VALUES($1::uuid,$2::uuid,'Wardrobe QA','Techno','Test','Test','Test',0,0,now()+interval '20 minutes',now()+interval '8 hours','published')`, f.event, f.owner)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, table := range []string{"wardrobe_audit", "wardrobe_deposits", "wardrobe_staff", "wardrobe_zones"} {
			_, _ = pool.Exec(ctx, "DELETE FROM "+table+" WHERE event_id=$1::uuid", f.event)
		}
		_, _ = pool.Exec(ctx, `DELETE FROM events WHERE id=$1::uuid`, f.event)
		for _, id := range []string{f.owner, f.staff, f.supervisor, f.customer, f.other, f.outsider} {
			_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1::uuid`, id)
		}
		pool.Close()
	})
	f.cmd(t, f.owner, Command{Action: "zone", Name: "Desk A", Prefix: "A", Kind: "any", Capacity: 2, Enabled: true}, 200)
	if err = pool.QueryRow(ctx, `SELECT id::text FROM wardrobe_zones WHERE event_id=$1::uuid`, f.event).Scan(&f.zone); err != nil {
		t.Fatal(err)
	}
	for _, s := range []struct{ id, role string }{{f.staff, "operator"}, {f.supervisor, "supervisor"}} {
		f.cmd(t, f.owner, Command{Action: "staff", Email: s.id + "@example.invalid", Role: s.role}, 200)
	}
	return f
}
func (f *fixture) request(actor, method, path string, body any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, strings.NewReader(string(raw)))
	r = r.WithContext(context.WithValue(r.Context(), auth.UserIDKey, actor))
	w := httptest.NewRecorder()
	f.h.Routes().ServeHTTP(w, r)
	return w
}

type receipt struct {
	ID, Number, Status, UserID, PickupID string
	Revision                             int
	Remaining, PickupItems               Items
	PickupApproved                       bool
}

func decode(t *testing.T, w *httptest.ResponseRecorder) receipt {
	t.Helper()
	var out struct {
		Deposit receipt `json:"deposit"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out.Deposit
}
func (f *fixture) cmd(t *testing.T, actor string, c Command, status int) receipt {
	t.Helper()
	w := f.request(actor, "POST", "/events/"+f.event+"/commands", c)
	if w.Code != status {
		t.Fatalf("%s: got %d want %d: %s", c.Action, w.Code, status, w.Body.String())
	}
	if status != 200 {
		return receipt{}
	}
	return decode(t, w)
}
func (f *fixture) reserve(customer string) Command {
	return Command{Action: "reserve", Code: "glow://friend/" + customer, ZoneID: f.zone, Items: Items{Coat: 1, Bag: 1}, RequestID: uuid()}
}
func (f *fixture) get(t *testing.T, id string) receipt {
	t.Helper()
	w := f.request(f.staff, "GET", "/events/"+f.event+"/deposits/"+id, nil)
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	return decode(t, w)
}
func TestItemsAndProfileQR(t *testing.T) {
	for _, bad := range []Items{{}, {Coat: -1, Bag: 2}, {Coat: 21}, {Coat: 10, Bag: 11}} {
		if bad.valid() {
			t.Fatalf("accepted %+v", bad)
		}
	}
	if !(Items{Coat: 1}).fitsKind("coat") || (Items{Bag: 1}).fitsKind("coat") || (Items{Coat: 1}).fitsKind("bag") {
		t.Fatal("wrong rack type")
	}
	id := uuid()
	if profileID("glow://friend/"+id) != id || profileID("pulse://friend/"+id) != id {
		t.Fatal("profile QR rejected")
	}
	for _, bad := range []string{id, "https://example.test/" + id, "glow://friend/" + id + "?pickup=true", "glow://friend/invalid"} {
		if profileID(bad) != "" {
			t.Fatal("invalid QR accepted")
		}
	}
	h := &Handler{}
	w := httptest.NewRecorder()
	h.Routes().ServeHTTP(w, httptest.NewRequest("GET", "/mine", nil))
	if w.Code != 401 {
		t.Fatal("unauthenticated access")
	}
}

func TestZonePrefixesKeepPhysicalNumbersUnambiguous(t *testing.T) {
	f := seed(t)
	for _, prefix := range []string{"A1", "A0B", "1", "A-B", "", "ABCDEFGHI"} {
		f.cmd(t, f.owner, Command{Action: "zone", Name: "Invalid prefix", Prefix: prefix, Kind: "any", Capacity: 1001, Enabled: true}, 400)
	}
	// Valid lowercase input is normalized. Eight letters remain supported.
	for _, prefix := range []string{" b ", "ABCDEFGH"} {
		f.cmd(t, f.owner, Command{Action: "zone", Name: "Valid prefix", Prefix: prefix, Kind: "any", Capacity: 1, Enabled: true}, 200)
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM wardrobe_zones WHERE event_id=$1::uuid`, f.event).Scan(&count); err != nil || count != 3 {
		t.Fatalf("invalid prefix created a zone: count=%d err=%v", count, err)
	}
	// Enforce the same invariant independently at the database boundary.
	_, err := f.pool.Exec(context.Background(), `INSERT INTO wardrobe_zones(event_id,name,prefix,kind,capacity) VALUES($1::uuid,'Ambiguous','A1','any',1)`, f.event)
	var check *pgconn.PgError
	if !errors.As(err, &check) || check.Code != "23514" {
		t.Fatalf("database accepted numeric prefix or returned wrong error: %v", err)
	}
}
func TestAutomaticAllocationConcurrencyAndRetry(t *testing.T) {
	f := seed(t)
	var wg sync.WaitGroup
	responses := make(chan *httptest.ResponseRecorder, 12)
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			responses <- f.request(f.staff, "POST", "/events/"+f.event+"/commands", f.reserve(f.customer))
		}()
	}
	wg.Wait()
	close(responses)
	id := ""
	for w := range responses {
		if w.Code != 200 {
			t.Fatalf("concurrent reserve: %d %s", w.Code, w.Body.String())
		}
		d := decode(t, w)
		if id == "" {
			id = d.ID
		}
		if d.ID != id || d.Number != "A001" {
			t.Fatal("duplicate deposit or non-first free slot")
		}
	}
	c := f.reserve(f.other)
	d := f.cmd(t, f.staff, c, 200)
	if d.Number != "A002" {
		t.Fatal(d)
	}
	again := f.cmd(t, f.staff, c, 200)
	if again.ID != d.ID {
		t.Fatal("request retry duplicated deposit")
	}
	c.Items.Coat = 2
	f.cmd(t, f.staff, c, 409)
	f.cmd(t, f.staff, f.reserve(f.supervisor), 409)
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM wardrobe_deposits WHERE event_id=$1::uuid`, f.event).Scan(&count); err != nil || count != 2 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	f.cmd(t, f.staff, Command{Action: "cancel", DepositID: id, Revision: 1}, 200)
	next := f.cmd(t, f.staff, f.reserve(f.supervisor), 200)
	if next.Number != "A001" {
		t.Fatal("cancel did not free first slot")
	}
}
func TestCustodyApprovalPartialReturnAndIsolation(t *testing.T) {
	f := seed(t)
	for _, actor := range []string{f.customer, f.outsider} {
		f.cmd(t, actor, f.reserve(f.customer), 403)
		w := f.request(actor, "GET", "/events/"+f.event, nil)
		if w.Code != 403 {
			t.Fatal("private list exposed")
		}
	}
	f.cmd(t, f.staff, Command{Action: "zone", Name: "Hacked", Prefix: "B", Kind: "any", Capacity: 1, Enabled: true}, 403)
	d := f.cmd(t, f.staff, f.reserve(f.customer), 200)
	d = f.cmd(t, f.staff, Command{Action: "store", DepositID: d.ID, Revision: d.Revision}, 200)
	d = f.cmd(t, f.staff, Command{Action: "request-pickup", DepositID: d.ID, Revision: d.Revision, Items: Items{Bag: 1}}, 200)
	f.cmd(t, f.staff, Command{Action: "return", DepositID: d.ID, Revision: d.Revision, PickupID: d.PickupID}, 409)
	for _, actor := range []string{f.other, f.staff, f.owner} {
		w := f.request(actor, "POST", "/mine/"+d.ID+"/confirm", map[string]any{"pickupId": d.PickupID, "approve": true})
		if w.Code != 404 {
			t.Fatal("profile QR or staff authorized collection")
		}
	}
	approve := func(yes bool) {
		w := f.request(f.customer, "POST", "/mine/"+d.ID+"/confirm", map[string]any{"pickupId": d.PickupID, "approve": yes})
		if w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		d = f.get(t, d.ID)
	}
	approve(true)
	approvedRevision := d.Revision
	d = f.cmd(t, f.staff, Command{Action: "return", DepositID: d.ID, Revision: d.Revision, PickupID: d.PickupID, Items: Items{Coat: 1, Bag: 1}}, 200)
	if d.Status != "stored" || d.Remaining != (Items{Coat: 1}) {
		t.Fatal("partial collection did not use approved items")
	}
	f.cmd(t, f.staff, Command{Action: "return", DepositID: d.ID, Revision: approvedRevision}, 409)
	d = f.cmd(t, f.staff, Command{Action: "request-pickup", DepositID: d.ID, Revision: d.Revision, Items: Items{Coat: 1}}, 200)
	oldPickup := d.PickupID
	approve(false)
	w := f.request(f.customer, "POST", "/mine/"+d.ID+"/confirm", map[string]any{"pickupId": oldPickup, "approve": true})
	if w.Code != 409 {
		t.Fatal("revoked pickup accepted")
	}
	d = f.cmd(t, f.staff, Command{Action: "request-pickup", DepositID: d.ID, Revision: d.Revision, Items: Items{Coat: 1}}, 200)
	approve(true)
	d = f.cmd(t, f.staff, Command{Action: "return", DepositID: d.ID, Revision: d.Revision, PickupID: d.PickupID}, 200)
	if d.Status != "returned" || d.Remaining.total() != 0 {
		t.Fatal("did not finish custody")
	}
	w = f.request(f.customer, "GET", "/mine", nil)
	if w.Code != 200 || strings.Contains(w.Body.String(), d.ID) {
		t.Fatal("closed deposit still active")
	}
	other := f.cmd(t, f.staff, f.reserve(f.other), 200)
	if other.Number != "A001" {
		t.Fatal("return did not free slot")
	}
	w = f.request(f.customer, "GET", "/mine", nil)
	if strings.Contains(w.Body.String(), other.ID) {
		t.Fatal("other customer's deposit exposed")
	}
	w = f.request(f.owner, "GET", "/events/"+f.event+"?history=true", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "customer-confirm") || !strings.Contains(w.Body.String(), f.staff) {
		t.Fatal("history/audit missing", w.Body.String())
	}
}
func TestExpiryDisabledZoneClosedEventAndSupervisedRecovery(t *testing.T) {
	f := seed(t)
	ctx := context.Background()
	d := f.cmd(t, f.staff, f.reserve(f.customer), 200)
	if _, err := f.pool.Exec(ctx, `UPDATE wardrobe_deposits SET reserved_until=now()-interval '1 second' WHERE id=$1::uuid`, d.ID); err != nil {
		t.Fatal(err)
	}
	f.cmd(t, f.staff, Command{Action: "store", DepositID: d.ID, Revision: d.Revision}, 409)
	d = f.cmd(t, f.staff, f.reserve(f.customer), 200)
	if d.Number != "A001" {
		t.Fatal("expired hold not released")
	}
	d = f.cmd(t, f.staff, Command{Action: "store", DepositID: d.ID, Revision: d.Revision}, 200)
	f.cmd(t, f.staff, Command{Action: "recover", DepositID: d.ID, Revision: d.Revision, Items: d.Remaining, Reason: "Verified matching claim information"}, 403)
	f.cmd(t, f.supervisor, Command{Action: "recover", DepositID: d.ID, Revision: d.Revision, Items: d.Remaining, Reason: "ok"}, 400)
	f.cmd(t, f.owner, Command{Action: "zone", ZoneID: f.zone, Name: "Desk A", Prefix: "A", Kind: "any", Capacity: 2, Enabled: false, Revision: 1}, 200)
	f.cmd(t, f.staff, f.reserve(f.other), 409)
	if _, err := f.pool.Exec(ctx, `UPDATE events SET status='completed',end_time=now()-interval '1 second' WHERE id=$1::uuid`, f.event); err != nil {
		t.Fatal(err)
	}
	same := f.cmd(t, f.staff, f.reserve(f.customer), 200)
	if same.ID != d.ID {
		t.Fatal("ended event lookup lost belongings")
	}
	d = f.cmd(t, f.supervisor, Command{Action: "recover", DepositID: d.ID, Revision: d.Revision, Items: d.Remaining, Reason: "Verified matching claim information"}, 200)
	if d.Status != "returned" {
		t.Fatal("recovery failed")
	}
	f.cmd(t, f.owner, Command{Action: "remove-staff", UserID: f.staff}, 200)
	w := f.request(f.staff, "GET", "/events/"+f.event, nil)
	if w.Code != 403 {
		t.Fatal("revoked staff retained access")
	}
}
func TestPickupExpiryAndMoveInvalidateApproval(t *testing.T) {
	f := seed(t)
	d := f.cmd(t, f.staff, f.reserve(f.customer), 200)
	d = f.cmd(t, f.staff, Command{Action: "store", DepositID: d.ID, Revision: d.Revision}, 200)
	d = f.cmd(t, f.staff, Command{Action: "request-pickup", DepositID: d.ID, Revision: d.Revision, Items: d.Remaining}, 200)
	if _, err := f.pool.Exec(context.Background(), `UPDATE wardrobe_deposits SET pickup_approved_at=now(),pickup_expires_at=now()-interval '1 second' WHERE id=$1::uuid`, d.ID); err != nil {
		t.Fatal(err)
	}
	f.cmd(t, f.staff, Command{Action: "return", DepositID: d.ID, Revision: d.Revision, PickupID: d.PickupID}, 409)
	d = f.cmd(t, f.staff, Command{Action: "request-pickup", DepositID: d.ID, Revision: d.Revision, Items: d.Remaining}, 200)
	w := f.request(f.customer, "POST", "/mine/"+d.ID+"/confirm", map[string]any{"pickupId": d.PickupID, "approve": true})
	if w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	d = f.get(t, d.ID)
	old := d.PickupID
	d = f.cmd(t, f.staff, Command{Action: "move", DepositID: d.ID, Revision: d.Revision, ZoneID: f.zone}, 200)
	if d.Number != "A002" || d.PickupID != "" || d.PickupApproved {
		t.Fatal("move preserved stale approval", fmt.Sprint(d))
	}
	f.cmd(t, f.staff, Command{Action: "return", DepositID: d.ID, Revision: d.Revision, PickupID: old}, 409)
}

func TestQueuedCommandObservesCommittedStaffRevocationOrDemotion(t *testing.T) {
	for _, demotion := range []bool{false, true} {
		name := "revocation"
		if demotion {
			name = "supervisor_demotion"
		}
		t.Run(name, func(t *testing.T) {
			f := seed(t)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			actor := f.staff
			command := f.reserve(f.customer)
			if demotion {
				d := f.cmd(t, f.staff, command, 200)
				d = f.cmd(t, f.staff, Command{Action: "store", DepositID: d.ID, Revision: d.Revision}, 200)
				actor = f.supervisor
				command = Command{Action: "recover", DepositID: d.ID, Revision: d.Revision, Items: d.Remaining, Reason: "Verified matching claim information"}
			}

			// Hold the exact event lock used by configure(), with the staff change
			// still uncommitted, then queue an operation using the old permission.
			tx, err := f.pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(context.Background())
			var event string
			if err = tx.QueryRow(ctx, `SELECT id::text FROM events WHERE id=$1::uuid FOR UPDATE`, f.event).Scan(&event); err != nil {
				t.Fatal(err)
			}
			if demotion {
				_, err = tx.Exec(ctx, `UPDATE wardrobe_staff SET role='operator' WHERE event_id=$1::uuid AND user_id=$2::uuid`, f.event, actor)
			} else {
				_, err = tx.Exec(ctx, `DELETE FROM wardrobe_staff WHERE event_id=$1::uuid AND user_id=$2::uuid`, f.event, actor)
			}
			if err != nil {
				t.Fatal(err)
			}
			response := make(chan *httptest.ResponseRecorder, 1)
			go func() { response <- f.request(actor, "POST", "/events/"+f.event+"/commands", command) }()

			// Observe the lock wait rather than assume goroutine scheduling from
			// a fixed sleep. This reproduces the stale single-statement snapshot.
			blocked := false
			deadline := time.Now().Add(3 * time.Second)
			for time.Now().Before(deadline) {
				if err = f.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock')`, tx.Conn().PgConn().PID()).Scan(&blocked); err != nil {
					t.Fatal(err)
				}
				if blocked {
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			if !blocked {
				t.Fatal("staff operation did not queue behind the permission change")
			}
			if err = tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			select {
			case w := <-response:
				if w.Code != 403 {
					t.Fatalf("queued %s used revoked permission: status=%d body=%s", command.Action, w.Code, w.Body.String())
				}
			case <-ctx.Done():
				t.Fatal("queued staff operation did not finish after permission change")
			}
			if demotion {
				d := f.get(t, command.DepositID)
				if d.Status != "stored" || d.Remaining != command.Items {
					t.Fatal("demoted supervisor changed custody")
				}
			} else {
				var count int
				if err := f.pool.QueryRow(ctx, `SELECT count(*) FROM wardrobe_deposits WHERE event_id=$1::uuid`, f.event).Scan(&count); err != nil || count != 0 {
					t.Fatalf("revoked staff allocated a place: count=%d err=%v", count, err)
				}
			}
		})
	}
}
