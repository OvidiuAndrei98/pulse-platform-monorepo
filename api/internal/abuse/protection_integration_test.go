package abuse

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func abuseSecurityPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("ABUSE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set ABUSE_TEST_DATABASE_URL to a local spottr_security_test database")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal("invalid abuse security test database config")
	}
	if config.ConnConfig.Host != "127.0.0.1" || config.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated test database")
	}
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	schema := "abuse_test_" + hex.EncodeToString(random)
	admin, err := pgxpool.NewWithConfig(context.Background(), config.Copy())
	if err != nil {
		t.Fatal(err)
	}
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err := admin.Exec(context.Background(), "CREATE SCHEMA "+identifier); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), "DROP SCHEMA "+identifier+" CASCADE")
		admin.Close()
	})
	config.ConnConfig.RuntimeParams["search_path"] = schema
	config.MaxConns = 20
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(context.Background(), `CREATE TABLE request_rate_limits (
scope varchar(64) NOT NULL, subject_hash bytea NOT NULL, attempt_count integer NOT NULL,
window_end timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
PRIMARY KEY(scope,subject_hash))`); err != nil {
		t.Fatal(err)
	}
	return pool
}

func TestPostgresLimiterIsAtomicAcrossInstances(t *testing.T) {
	pool := abuseSecurityPool(t)
	key := []byte("01234567890123456789012345678901")
	first := &Protection{store: postgresCounterStore{pool: pool}, hashKey: key}
	second := &Protection{store: postgresCounterStore{pool: pool}, hashKey: key}
	const limit = 20
	const attempts = 60
	var allowed atomic.Int32
	var failures atomic.Int32
	var wait sync.WaitGroup
	for attempt := 0; attempt < attempts; attempt++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			limiter := first
			if index%2 == 1 {
				limiter = second
			}
			decision, err := limiter.Consume(context.Background(), "concurrent", "same-subject", limit, time.Minute)
			if err != nil {
				failures.Add(1)
				return
			}
			if decision.Allowed {
				allowed.Add(1)
			}
		}(attempt)
	}
	wait.Wait()
	if failures.Load() != 0 {
		t.Fatalf("store failures = %d", failures.Load())
	}
	if allowed.Load() != limit {
		t.Fatalf("allowed = %d, want exact shared limit %d", allowed.Load(), limit)
	}
	var persistedCount int
	if err := pool.QueryRow(context.Background(), `SELECT attempt_count FROM request_rate_limits WHERE scope = 'concurrent'`).Scan(&persistedCount); err != nil {
		t.Fatal(err)
	}
	if persistedCount != limit+1 {
		t.Fatalf("persisted count = %d, want saturated value %d", persistedCount, limit+1)
	}
}

func TestPostgresLimiterStartsNewWindowAfterExpiry(t *testing.T) {
	pool := abuseSecurityPool(t)
	protection := &Protection{store: postgresCounterStore{pool: pool}, hashKey: []byte("01234567890123456789012345678901")}
	first, err := protection.Consume(context.Background(), "expiry", "subject", 1, 100*time.Millisecond)
	if err != nil || !first.Allowed {
		t.Fatalf("first decision = %+v, err=%v", first, err)
	}
	limited, err := protection.Consume(context.Background(), "expiry", "subject", 1, 100*time.Millisecond)
	if err != nil || limited.Allowed {
		t.Fatalf("second decision = %+v, err=%v", limited, err)
	}
	time.Sleep(150 * time.Millisecond)
	reset, err := protection.Consume(context.Background(), "expiry", "subject", 1, 100*time.Millisecond)
	if err != nil || !reset.Allowed {
		t.Fatalf("new window decision = %+v, err=%v", reset, err)
	}
}
