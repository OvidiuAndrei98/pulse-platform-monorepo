package outings

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/tickets"
)

type fixture struct {
	pool                                   *pgxpool.Pool
	users                                  [3]pgtype.UUID
	emails                                 [3]string
	event, otherEvent, tier, order, ticket pgtype.UUID
	handler                                *Handler
}

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("ISOLATION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires a migrated local spottr_security_test database")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}
func mustExec(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql, args...); err != nil {
		t.Fatal(err)
	}
}
func rowID(t *testing.T, pool *pgxpool.Pool, sql string, args ...any) pgtype.UUID {
	t.Helper()
	var id pgtype.UUID
	if err := pool.QueryRow(context.Background(), sql, args...).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}
func seed(t *testing.T) fixture {
	t.Helper()
	f := fixture{pool: testPool(t)}
	f.handler = &Handler{Pool: f.pool}
	suffix := time.Now().UnixNano()
	for i := range f.users {
		f.emails[i] = fmt.Sprintf("outings-%d-%d@example.invalid", suffix, i)
		f.users[i] = rowID(t, f.pool, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'test-only','user',TRUE) RETURNING id`, fmt.Sprintf("outings-%d-%d", suffix, i), f.emails[i])
	}
	for i, target := range []*pgtype.UUID{&f.event, &f.otherEvent} {
		*target = rowID(t, f.pool, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status)
       VALUES($1,'Outing test','house','Venue','Bucuresti','social',44,26,clock_timestamp()+interval '48 hours',clock_timestamp()+interval '50 hours',$2,'published') RETURNING id`, f.users[2], fmt.Sprintf("outings-%d-%d", suffix, i))
	}
	f.tier = rowID(t, f.pool, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,tickets_sold,start_sales,end_sales) VALUES($1,'General',50,100,1,now()-interval '1 day',now()+interval '1 day') RETURNING id`, f.event)
	f.order = rowID(t, f.pool, `INSERT INTO orders(user_id,event_id,email,total_amount,status) VALUES($1,$2,$3,50,'completed') RETURNING id`, f.users[0], f.event, f.emails[0])
	f.ticket = rowID(t, f.pool, `INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash) VALUES($1,$2,$3,$4) RETURNING id`, f.order, f.tier, f.users[0], strings.Repeat("a", 64))
	mustExec(t, f.pool, `INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted')`, f.users[0], f.users[1])
	t.Cleanup(func() {
		mustExec(t, f.pool, `DELETE FROM outing_plans WHERE owner_id=$1`, f.users[0])
		mustExec(t, f.pool, `DELETE FROM notifications WHERE actor_id=ANY($1)`, f.users[:])
		mustExec(t, f.pool, `DELETE FROM offline_validation_snapshots WHERE event_id=$1`, f.event)
		mustExec(t, f.pool, `DELETE FROM orders WHERE id=$1`, f.order)
		mustExec(t, f.pool, `DELETE FROM ticket_types WHERE id=$1`, f.tier)
		mustExec(t, f.pool, `DELETE FROM events WHERE id=ANY($1)`, []pgtype.UUID{f.event, f.otherEvent})
		mustExec(t, f.pool, `DELETE FROM users WHERE id=ANY($1)`, f.users[:])
	})
	return f
}
func request(method, path string, payload any, actor pgtype.UUID) *http.Request {
	var data []byte
	if payload != nil {
		data, _ = json.Marshal(payload)
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(data))
	return r.WithContext(context.WithValue(r.Context(), auth.UserIDKey, sid(actor)))
}
func (f fixture) call(method, path string, payload any, actor pgtype.UUID) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	f.handler.Routes().ServeHTTP(w, request(method, path, payload, actor))
	return w
}
func want(t *testing.T, w *httptest.ResponseRecorder, status int) {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status=%d want=%d response=%s", w.Code, status, w.Body.String())
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private response cached")
	}
}
func key(t *testing.T, f fixture) string { return sid(rowID(t, f.pool, `SELECT gen_random_uuid()`)) }
func createInvitation(t *testing.T, f fixture) transfer {
	t.Helper()
	w := f.call("POST", "/transfers", map[string]any{"ticketId": sid(f.ticket), "recipientEmail": f.emails[1], "requestId": key(t, f)}, f.users[0])
	want(t, w, 201)
	var x transfer
	if json.Unmarshal(w.Body.Bytes(), &x) != nil {
		t.Fatal("invalid response")
	}
	if x.RecipientID != "" || x.RecipientName != "" {
		t.Fatal("account existence leaked")
	}
	return x
}
func storedTicket(t *testing.T, f fixture) (pgtype.UUID, string, int32, bool) {
	t.Helper()
	var owner pgtype.UUID
	var hash string
	var generation int32
	var used bool
	if err := f.pool.QueryRow(context.Background(), `SELECT user_id,validation_hash,validation_generation,is_validated FROM tickets WHERE id=$1`, f.ticket).Scan(&owner, &hash, &generation, &used); err != nil {
		t.Fatal(err)
	}
	return owner, hash, generation, used
}
func TestTransferOwnershipRotationIdempotencyAndFinancialIsolation(t *testing.T) {
	f := seed(t)
	x := createInvitation(t, f)
	want(t, f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[2]), 404)
	want(t, f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 200)
	owner, hash, generation, used := storedTicket(t, f)
	if owner != f.users[1] || hash == strings.Repeat("a", 64) || len(hash) != 64 || generation != 1 || used {
		t.Fatal("rotation/ownership failed")
	}
	want(t, f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 200)
	_, second, gen, _ := storedTicket(t, f)
	if second != hash || gen != 1 {
		t.Fatal("duplicate acceptance rotated twice")
	}
	q := db.New(f.pool)
	sender, e := q.GetUserTickets(context.Background(), f.users[0])
	if e != nil || len(sender) != 0 {
		t.Fatal("sender retained ticket", e)
	}
	recipient, e := q.GetUserTickets(context.Background(), f.users[1])
	if e != nil || len(recipient) != 1 {
		t.Fatal("recipient missing ticket", e)
	}
	var buyer pgtype.UUID
	if e = f.pool.QueryRow(context.Background(), `SELECT user_id FROM orders WHERE id=$1`, f.order).Scan(&buyer); e != nil || buyer != f.users[0] {
		t.Fatal("financial ownership moved")
	}
	if _, e = q.GetTicketByHash(context.Background(), strings.Repeat("a", 64)); e != pgx.ErrNoRows {
		t.Fatal("old QR is still live")
	}
	// A legacy API query which previously read the old hash must fail closed.
	_, e = f.pool.Exec(context.Background(), `UPDATE tickets SET is_validated=TRUE WHERE id=$1 AND NOT is_validated`, f.ticket)
	if e == nil {
		t.Fatal("legacy validator accepted a rotated ticket")
	}
	_, _, _, used = storedTicket(t, f)
	if used {
		t.Fatal("legacy validation changed ticket")
	}
	_, e = q.ValidateTicketOnce(context.Background(), db.ValidateTicketOnceParams{ID: f.ticket, ValidationHash: strings.Repeat("a", 64), AdmissionAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}})
	if e != pgx.ErrNoRows {
		t.Fatalf("old expected hash: %v", e)
	}
	_, e = q.ValidateTicketOnce(context.Background(), db.ValidateTicketOnceParams{ID: f.ticket, ValidationHash: hash, AdmissionAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}})
	if e != nil {
		t.Fatal("new QR failed", e)
	}
}
func TestGenericInvitationsAndBoundUniqueActiveEmail(t *testing.T) {
	f := seed(t)
	x := createInvitation(t, f)
	mustExec(t, f.pool, `UPDATE ticket_transfers SET status='cancelled' WHERE id=$1`, x.ID)
	w := f.call("POST", "/transfers", map[string]string{"ticketId": sid(f.ticket), "recipientEmail": "does-not-exist@example.invalid", "requestId": key(t, f)}, f.users[0])
	want(t, w, 201)
	var unknown transfer
	_ = json.Unmarshal(w.Body.Bytes(), &unknown)
	if unknown.RecipientID != "" || unknown.RecipientName != "" || unknown.Status != "pending" {
		t.Fatal("unknown email response differs")
	}
	want(t, f.call("POST", "/transfers/"+unknown.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 404)
	mustExec(t, f.pool, `UPDATE ticket_transfers SET status='cancelled' WHERE id=$1`, unknown.ID)
	x = createInvitation(t, f)
	mustExec(t, f.pool, `UPDATE users SET email=$2 WHERE id=$1`, f.users[2], strings.ToUpper(f.emails[1]))
	var list []transfer
	w = f.call("GET", "/transfers", nil, f.users[1])
	want(t, w, 200)
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if len(list) != 0 {
		t.Fatal("ambiguous email saw invitation")
	}
	want(t, f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "declined"}, f.users[1]), 404)
}
func TestTransferEligibility(t *testing.T) {
	for name, sql := range map[string]string{
		"used":           `UPDATE tickets SET is_validated=TRUE WHERE id=$1`,
		"refunded":       `UPDATE orders SET status='refunded' WHERE id=$1`,
		"partial":        `UPDATE orders SET stripe_amount_refunded_bani=1,stripe_refund_status='partial' WHERE id=$1`,
		"attention":      `UPDATE orders SET stripe_refund_needs_attention=TRUE WHERE id=$1`,
		"cancelled":      `UPDATE events SET status='cancelled' WHERE id=$1`,
		"cancel_pending": `UPDATE events SET status='cancel_pending' WHERE id=$1`,
		"started":        `UPDATE events SET start_time=now()-interval '1 minute' WHERE id=$1`,
	} {
		t.Run(name, func(t *testing.T) {
			f := seed(t)
			target := f.order
			if name == "used" {
				target = f.ticket
			}
			if name == "cancelled" || name == "cancel_pending" || name == "started" {
				target = f.event
			}
			mustExec(t, f.pool, sql, target)
			w := f.call("POST", "/transfers", map[string]string{"ticketId": sid(f.ticket), "recipientEmail": f.emails[1], "requestId": key(t, f)}, f.users[0])
			want(t, w, 409)
		})
	}
}
func TestAcceptanceAndCancellationHaveOneWinner(t *testing.T) {
	f := seed(t)
	x := createInvitation(t, f)
	var wg sync.WaitGroup
	wg.Add(2)
	responses := make(chan int, 2)
	go func() {
		defer wg.Done()
		responses <- f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]).Code
	}()
	go func() {
		defer wg.Done()
		responses <- f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "cancelled"}, f.users[0]).Code
	}()
	wg.Wait()
	close(responses)
	ok, closed := 0, 0
	for status := range responses {
		if status == 200 {
			ok++
		} else if status == 409 {
			closed++
		} else {
			t.Fatal("unexpected race status", status)
		}
	}
	if ok != 1 || closed != 1 {
		t.Fatal("two terminal winners")
	}
}
func snapshot(t *testing.T, f fixture) *httptest.ResponseRecorder {
	t.Helper()
	h := tickets.NewHandler(db.New(f.pool), f.pool, "https://test.invalid")
	r := request("POST", "/", nil, f.users[2])
	route := chi.NewRouteContext()
	route.URLParams.Add("id", sid(f.event))
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, route))
	w := httptest.NewRecorder()
	h.HandleCreateOfflineSnapshot(w, r)
	return w
}
func TestSnapshotMembershipAndPermanentTransferCutoff(t *testing.T) {
	f := seed(t)
	w := snapshot(t, f)
	want(t, w, 200)
	var pack struct {
		SnapshotID  string `json:"snapshotId"`
		TicketCount int    `json:"ticketCount"`
		Tickets     []struct {
			ValidationHash string `json:"validationHash"`
		} `json:"tickets"`
	}
	if json.Unmarshal(w.Body.Bytes(), &pack) != nil || pack.TicketCount != 1 {
		t.Fatalf("invalid pack: %s", w.Body.String())
	}
	var hash string
	if e := f.pool.QueryRow(context.Background(), `SELECT validation_hash FROM offline_validation_snapshot_entries WHERE snapshot_id=$1`, pack.SnapshotID).Scan(&hash); e != nil || hash != pack.Tickets[0].ValidationHash {
		t.Fatal("response differs from persisted membership", e)
	}
	// Deleting a snapshot cannot reopen transfer after devices downloaded it.
	mustExec(t, f.pool, `DELETE FROM offline_validation_snapshots WHERE id=$1`, pack.SnapshotID)
	want(t, f.call("POST", "/transfers", map[string]string{"ticketId": sid(f.ticket), "recipientEmail": f.emails[1], "requestId": key(t, f)}, f.users[0]), 409)
	if _, e := f.pool.Exec(context.Background(), `INSERT INTO offline_validation_snapshots(event_id,created_by_user_id,ticket_count,expires_at) VALUES($1,$2,1,now()+interval '1 hour')`, f.event, f.users[2]); e == nil {
		t.Fatal("legacy writer issued a pack")
	}
}
func TestPrivatePlanInvitationsVotesAndOwnerDecision(t *testing.T) {
	f := seed(t)
	payload := createPlanRequest{RequestID: key(t, f), Title: "Our night", EventIDs: []string{sid(f.event), sid(f.otherEvent)}, FriendIDs: []string{sid(f.users[1])}}
	w := f.call("POST", "/plans", payload, f.users[0])
	want(t, w, 201)
	var p plan
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	want(t, f.call("GET", "/plans/"+p.ID, nil, f.users[2]), 404)
	want(t, f.call("POST", "/plans/"+p.ID+"/vote", map[string]string{"eventId": sid(f.event)}, f.users[1]), 404)
	want(t, f.call("POST", "/plans/"+p.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 200)
	for range 2 {
		want(t, f.call("POST", "/plans/"+p.ID+"/vote", map[string]string{"eventId": sid(f.event)}, f.users[1]), 200)
	}
	var votes int
	if e := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM outing_plan_votes WHERE plan_id=$1`, p.ID).Scan(&votes); e != nil || votes != 1 {
		t.Fatal("duplicate vote")
	}
	want(t, f.call("POST", "/plans/"+p.ID+"/choose", map[string]string{"eventId": sid(f.event)}, f.users[1]), 404)
	want(t, f.call("POST", "/plans/"+p.ID+"/choose", map[string]string{"eventId": sid(f.event)}, f.users[0]), 200)
	want(t, f.call("POST", "/plans/"+p.ID+"/vote", map[string]string{"eventId": sid(f.otherEvent)}, f.users[1]), 409)
	want(t, f.call("POST", "/plans", payload, f.users[0]), 200)
}

func TestLegacyScanWinsBeforeAcceptanceAndCannotWinAfterIt(t *testing.T) {
	f := seed(t)
	x := createInvitation(t, f)
	ctx := context.Background()
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `UPDATE tickets SET is_validated=TRUE WHERE id=$1`, f.ticket); err != nil {
		t.Fatal(err)
	}
	response := make(chan int, 1)
	go func() {
		response <- f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]).Code
	}()
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case status := <-response:
		if status != 409 {
			t.Fatal("used ticket transferred", status)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("transfer did not finish")
	}
}
func TestSnapshotAndAcceptanceRaceKeepsPublishedCredentialsConsistent(t *testing.T) {
	for i := range 5 {
		t.Run(fmt.Sprint(i), func(t *testing.T) {
			f := seed(t)
			x := createInvitation(t, f)
			gate := make(chan struct{})
			snap := make(chan *httptest.ResponseRecorder, 1)
			accept := make(chan int, 1)
			go func() { <-gate; snap <- snapshot(t, f) }()
			go func() {
				<-gate
				accept <- f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]).Code
			}()
			close(gate)
			w, status := <-snap, <-accept
			want(t, w, 200)
			if status != 200 && status != 409 {
				t.Fatal("unexpected acceptance", status)
			}
			owner, hash, _, _ := storedTicket(t, f)
			var pack tickets.OfflineValidationSnapshotResponse
			if err := json.Unmarshal(w.Body.Bytes(), &pack); err != nil {
				t.Fatal(err)
			}
			if len(pack.Tickets) != 1 || pack.Tickets[0].ValidationHash != hash {
				t.Fatal("snapshot published a stale credential")
			}
			if status == 200 && owner != f.users[1] || status == 409 && owner != f.users[0] {
				t.Fatal("inconsistent ownership")
			}
		})
	}
}
func TestPendingAcceptanceRechecksRefundAndActiveRecipient(t *testing.T) {
	for name, sql := range map[string]string{"refund": `UPDATE orders SET stripe_refund_status='pending' WHERE id=$1`, "refund_operation": `INSERT INTO order_refund_operations(order_id,source,fee_policy) VALUES($1,'stripe_dashboard','review')`, "inactive": `UPDATE users SET is_active=FALSE WHERE id=$1`} {
		t.Run(name, func(t *testing.T) {
			f := seed(t)
			x := createInvitation(t, f)
			target := f.order
			expected := 409
			if name == "inactive" {
				target = f.users[1]
				expected = 401
			}
			mustExec(t, f.pool, sql, target)
			if name == "refund_operation" {
				defer mustExec(t, f.pool, `DELETE FROM order_refund_operations WHERE order_id=$1`, f.order)
			}
			want(t, f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]), expected)
			owner, _, generation, _ := storedTicket(t, f)
			if owner != f.users[0] || generation != 0 {
				t.Fatal("ineligible transfer modified ticket")
			}
		})
	}
}
func TestCancellationCannotDeadlockAcceptanceOnAnOrderLock(t *testing.T) {
	f := seed(t)
	x := createInvitation(t, f)
	mustExec(t, f.pool, `UPDATE events SET status='cancel_pending' WHERE id=$1`, f.event)
	tx, err := f.pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(context.Background(), `SELECT id FROM orders WHERE id=$1 FOR UPDATE`, f.order); err != nil {
		t.Fatal(err)
	}
	done := make(chan int, 1)
	go func() {
		done <- f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]).Code
	}()
	select {
	case status := <-done:
		if status != 409 {
			t.Fatal("cancel_pending accepted", status)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("transfer tried to lock an order after cancellation")
	}
}
func TestInactiveSenderClosesPendingTransferAndSuppressesNotification(t *testing.T) {
	f := seed(t)
	x := createInvitation(t, f)
	mustExec(t, f.pool, `UPDATE users SET is_active=FALSE WHERE id=$1`, f.users[0])
	want(t, f.call("POST", "/transfers/"+x.ID+"/respond", map[string]string{"status": "accepted"}, f.users[1]), 409)
	owner, hash, generation, _ := storedTicket(t, f)
	if owner != f.users[0] || hash != strings.Repeat("a", 64) || generation != 0 {
		t.Fatal("suspended sender ticket moved")
	}
	if err := expireTransfers(context.Background(), f.pool, pgtype.UUID{}); err != nil {
		t.Fatal(err)
	}
	if err := deliverTransferNotifications(context.Background(), f.pool); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := f.pool.QueryRow(context.Background(), `SELECT status FROM ticket_transfers WHERE id=$1`, x.ID).Scan(&status); err != nil || status != "expired" {
		t.Fatal("suspended invitation not expired")
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), `SELECT count(*) FROM notifications WHERE actor_id=$1`, f.users[0]).Scan(&count); err != nil || count != 0 {
		t.Fatal("suspended sender notification sent")
	}
}
func TestSnapshotRevocationRecheckedAfterEventLock(t *testing.T) {
	f := seed(t)
	mustExec(t, f.pool, `INSERT INTO event_validation_staff(event_id,user_id,added_by) VALUES($1,$2,$3)`, f.event, f.users[1], f.users[2])
	tx, err := f.pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(context.Background(), `SELECT id FROM events WHERE id=$1 FOR UPDATE`, f.event); err != nil {
		t.Fatal(err)
	}
	response := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		h := tickets.NewHandler(db.New(f.pool), f.pool, "https://test.invalid")
		r := request("POST", "/", nil, f.users[1])
		route := chi.NewRouteContext()
		route.URLParams.Add("id", sid(f.event))
		w := httptest.NewRecorder()
		h.HandleCreateOfflineSnapshot(w, r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, route)))
		response <- w
	}()
	deadline := time.Now().Add(3 * time.Second)
	blocked := false
	for time.Now().Before(deadline) {
		var count int
		err = f.pool.QueryRow(context.Background(), `SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'UPDATE events SET ticket_transfers_locked%'`).Scan(&count)
		if err != nil {
			t.Fatal(err)
		}
		if count > 0 {
			blocked = true
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !blocked {
		t.Fatal("snapshot did not reach the event lock")
	}
	mustExec(t, f.pool, `DELETE FROM event_validation_staff WHERE event_id=$1 AND user_id=$2`, f.event, f.users[1])
	if err = tx.Commit(context.Background()); err != nil {
		t.Fatal(err)
	}
	select {
	case w := <-response:
		want(t, w, 403)
		if strings.Contains(w.Body.String(), "validationHash") {
			t.Fatal("revoked staff received credentials")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("snapshot hung")
	}
}
func TestNewSnapshotRejectsAnUnlistedTicketWithBackdatedScan(t *testing.T) {
	f := seed(t)
	w := snapshot(t, f)
	want(t, w, 200)
	var pack tickets.OfflineValidationSnapshotResponse
	_ = json.Unmarshal(w.Body.Bytes(), &pack)
	mustExec(t, f.pool, `INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash) VALUES($1,$2,$3,$4)`, f.order, f.tier, f.users[0], strings.Repeat("b", 64))
	h := tickets.NewHandler(db.New(f.pool), f.pool, "https://test.invalid")
	payload := tickets.SyncOfflineTicketScansRequest{SnapshotID: pack.SnapshotID, DeviceID: "test-device", Scans: []tickets.OfflineTicketScanPayload{{ClientScanID: key(t, f), ValidationHash: strings.Repeat("b", 64), ScannedAt: time.Now().UTC().Format(time.RFC3339Nano)}}}
	r := request("POST", "/", payload, f.users[2])
	route := chi.NewRouteContext()
	route.URLParams.Add("id", sid(f.event))
	w = httptest.NewRecorder()
	h.HandleSyncOfflineScans(w, r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, route)))
	if w.Code != 200 {
		t.Fatal("sync failed", w.Code, w.Body.String())
	}
	var result tickets.SyncOfflineTicketScansResponse
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if len(result.Results) != 1 || result.Results[0].Status != "invalid" {
		t.Fatal("unlisted ticket accepted")
	}
}
func TestNotificationsAreDurableOnceAndMeetingPointIsOwnerOnly(t *testing.T) {
	f := seed(t)
	x := createInvitation(t, f)
	ctx := context.Background()
	for range 2 {
		if err := deliverTransferNotifications(ctx, f.pool); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err := f.pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE actor_id=$1 AND user_id=$2 AND type='ticket_transfer'`, f.users[0], f.users[1]).Scan(&count); err != nil || count != 1 {
		t.Fatal("notification duplication", count, err)
	}
	var recipient pgtype.UUID
	if err := f.pool.QueryRow(ctx, `SELECT recipient_id FROM ticket_transfers WHERE id=$1`, x.ID).Scan(&recipient); err != nil || recipient.Valid {
		t.Fatal("notification bound recipient before acceptance")
	}
	group := rowID(t, f.pool, `INSERT INTO event_safety_groups(event_id,owner_id,expires_at) SELECT id,$2,end_time+interval '24 hours' FROM events WHERE id=$1 RETURNING id`, f.event, f.users[0])
	mustExec(t, f.pool, `INSERT INTO event_safety_group_members(group_id,event_id,user_id,status,invited_by) VALUES($1,$2,$3,'accepted',$3)`, group, f.event, f.users[0])
	want(t, f.call("POST", "/meeting-point/"+sid(f.event), map[string]string{"content": "By the main entrance"}, f.users[1]), 404)
	want(t, f.call("POST", "/meeting-point/"+sid(f.event), map[string]string{"content": "By the main entrance"}, f.users[0]), 200)
	var point string
	if err := f.pool.QueryRow(ctx, `SELECT meeting_point FROM event_safety_groups WHERE id=$1`, group).Scan(&point); err != nil || point != "By the main entrance" {
		t.Fatal("meeting point not saved")
	}
	mustExec(t, f.pool, `UPDATE orders SET stripe_refund_status='partial',stripe_amount_refunded_bani=1 WHERE id=$1`, f.order)
	want(t, f.call("POST", "/meeting-point/"+sid(f.event), map[string]string{"content": "No longer entitled"}, f.users[0]), 404)
}
