package notifications

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"pulse-api/internal/auth"
)

func TestPushPostgresLifecycle(t *testing.T) {
	dsn := os.Getenv("PUSH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set PUSH_TEST_DATABASE_URL to an isolated local spottr_push_test database")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if config.ConnConfig.Host != "127.0.0.1" || config.ConnConfig.Database != "spottr_push_test" {
		t.Fatal("refusing non-isolated database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`CREATE TABLE users(id uuid PRIMARY KEY,username text,avatar_url text);
        CREATE TABLE events(id uuid PRIMARY KEY);
        CREATE TABLE orders(id uuid PRIMARY KEY,event_id uuid,user_id uuid,status text);
        CREATE TABLE tickets(order_id uuid,user_id uuid);
        CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id),
        type text,title text,body text,event_id uuid,actor_id uuid,read_at timestamptz,created_at timestamptz DEFAULT now(),expires_at timestamptz);`)
	defer pool.Exec(context.Background(), `DROP TABLE IF EXISTS notification_push_revocations,notification_push_deliveries,notification_push_devices,notifications,tickets,orders,events,users CASCADE; DROP FUNCTION IF EXISTS enqueue_notification_push()`)
	migration, err := os.ReadFile("../database/migrations/20261013120000_notification_push.sql")
	if err != nil {
		t.Fatal(err)
	}
	exec(strings.Split(string(migration), "-- +goose Down")[0])
	const first = "11111111-1111-4111-8111-111111111111"
	const second = "22222222-2222-4222-8222-222222222222"
	const project = "33333333-3333-4333-8333-333333333333"
	const token = "ExpoPushToken[abcdefghijklmnop]"
	secret := strings.Repeat("a", 64)
	exec(`INSERT INTO users(id,username) VALUES($1,'one'),($2,'two')`, first, second)
	service := &PushService{Pool: pool, ProjectID: project, AccessToken: "test-only"}
	register := func(owner string) {
		t.Helper()
		request := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(fmt.Sprintf(`{"token":%q,"secret":%q,"projectId":%q,"language":"ro","platform":"ios"}`, token, secret, project)))
		request = request.WithContext(context.WithValue(ctx, auth.UserIDKey, owner))
		response := httptest.NewRecorder()
		service.HandleRegister(response, request)
		if response.Code != 200 {
			t.Fatalf("register status %d", response.Code)
		}
	}
	notice := func(owner, kind string) string {
		t.Helper()
		var id string
		err := pool.QueryRow(ctx, `INSERT INTO notifications(user_id,type,title,body) VALUES($1,$2,'title','body') RETURNING id::text`, owner, kind).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	count := func(sql string, args ...any) int {
		t.Helper()
		var n int
		if err := pool.QueryRow(ctx, sql, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	register(first)
	n := notice(first, "friend_request")
	if count(`SELECT count(*) FROM notification_push_deliveries WHERE notification_id=$1`, n) != 1 {
		t.Fatal("notification was not queued transactionally")
	}
	jobs := make(chan pushJob, 16)
	errs := make(chan error, 16)
	var workers sync.WaitGroup
	for range 12 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			batch, err := service.claim(ctx, "queued")
			errs <- err
			for _, job := range batch {
				jobs <- job
			}
		}()
	}
	workers.Wait()
	close(jobs)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	if len(jobs) != 1 {
		t.Fatalf("concurrent claims=%d; want one", len(jobs))
	}
	job := <-jobs
	if !job.Valid {
		t.Fatal("eligible job rejected")
	}
	exec(`UPDATE notification_push_deliveries SET available_at=now()-interval '1 second' WHERE notification_id=$1`, n)
	claimed, err := service.claim(ctx, "queued")
	if err != nil || len(claimed) != 1 {
		t.Fatal("lease not reclaimable", err)
	}
	service.finish(ctx, job, "done", "", 0)
	if count(`SELECT count(*) FROM notification_push_deliveries WHERE state='done'`) != 0 {
		t.Fatal("expired worker overwrote new lease")
	}
	service.result(ctx, claimed[0], expoResult{Status: "ok", ID: "receipt-fixture"}, false)
	if count(`SELECT count(*) FROM notification_push_deliveries WHERE state='receipt'`) != 1 {
		t.Fatal("accepted push must wait for receipt")
	}
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/getReceipts" {
			t.Error("unexpected send during receipt check")
		}
		_, _ = w.Write([]byte(`{"data":{"receipt-fixture":{"status":"ok"}}}`))
	}))
	defer fake.Close()
	service.Endpoint = fake.URL
	exec(`UPDATE notification_push_deliveries SET available_at=now()-interval '1 second' WHERE notification_id=$1`, n)
	service.runBatch(ctx, true)
	if count(`SELECT count(*) FROM notification_push_deliveries WHERE state='done'`) != 1 {
		t.Fatal("receipt not completed")
	}

	stale := notice(first, "friend_request")
	register(second)
	staleJobs, err := service.claim(ctx, "queued")
	if err != nil || len(staleJobs) != 1 || staleJobs[0].Valid {
		t.Fatal("old account job survived transfer", err)
	}
	service.finish(ctx, staleJobs[0], "dropped", "", 0)
	revoke := func(owner string) {
		request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(fmt.Sprintf(`{"token":%q,"secret":%q,"userId":%q}`, token, secret, owner)))
		response := httptest.NewRecorder()
		service.HandleUnregister(response, request)
		if response.Code != 204 {
			t.Fatalf("revoke status %d", response.Code)
		}
	}
	revoke(first)
	if count(`SELECT count(*) FROM notification_push_devices WHERE user_id=$1 AND enabled`, second) != 1 {
		t.Fatal("old logout disabled current account")
	}
	current := notice(second, "friend_accepted")
	newJobs, err := service.claim(ctx, "queued")
	if err != nil || len(newJobs) != 1 || newJobs[0].ID != current {
		t.Fatal("new account notification lost", err)
	}
	errorResult := expoResult{Status: "error"}
	errorResult.Details.Error = "DeviceNotRegistered"
	service.result(ctx, newJobs[0], errorResult, false)
	if count(`SELECT count(*) FROM notification_push_devices WHERE enabled`) != 0 {
		t.Fatal("dead device remains enabled")
	}
	register(second)
	read := notice(second, "friend_request")
	exec(`UPDATE notifications SET read_at=now() WHERE id=$1`, read)
	service.runBatch(ctx, false)
	if count(`SELECT count(*) FROM notification_push_deliveries WHERE notification_id=$1 AND state='dropped'`, read) != 1 {
		t.Fatal("read notification was sent again")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(ctx, `INSERT INTO notifications(user_id,type) VALUES($1,'friend_request')`, second)
	if err != nil {
		t.Fatal(err)
	}
	_ = tx.Rollback(ctx)
	if count(`SELECT count(*) FROM notification_push_deliveries WHERE state='queued'`) != 0 {
		t.Fatal("rolled back notification leaked into outbox")
	}
	if count(`SELECT count(*) FROM notification_push_deliveries WHERE notification_id=$1 AND state='dropped'`, stale) != 1 {
		t.Fatal("old account delivery not dropped")
	}
	revoke(second)
	if count(`SELECT count(*) FROM notification_push_devices WHERE enabled`) != 0 {
		t.Fatal("logout failed to revoke")
	}
	// Even a registration that reaches the server AFTER logout cannot revive it.
	late := httptest.NewRequest(http.MethodPut, "/", strings.NewReader(fmt.Sprintf(`{"token":%q,"secret":%q,"projectId":%q,"language":"ro","platform":"ios"}`, token, secret, project)))
	late = late.WithContext(context.WithValue(ctx, auth.UserIDKey, second))
	response := httptest.NewRecorder()
	service.HandleRegister(response, late)
	if response.Code != 409 || count(`SELECT count(*) FROM notification_push_devices WHERE enabled`) != 0 {
		t.Fatal("late registration revived a revoked capability")
	}
}
