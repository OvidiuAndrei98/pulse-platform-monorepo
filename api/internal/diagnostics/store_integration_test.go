package diagnostics

import (
	"context"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Opt-in and restricted to a dedicated disposable database; never uses the app's DATABASE_URL.
func TestPostgresReports(t *testing.T) {
	url := os.Getenv("DIAGNOSTICS_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set DIAGNOSTICS_TEST_DATABASE_URL for disposable PostgreSQL test")
	}
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	if config.ConnConfig.Database != "spottr_diagnostics_test" || config.ConnConfig.Host != "127.0.0.1" {
		t.Fatal("refusing non-isolated diagnostics database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	migration, err := os.ReadFile("../database/migrations/20261012180000_client_error_reports.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, strings.Split(string(migration), "-- +goose Down")[0]); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(context.Background(), "DROP TABLE client_error_reports")
	store := PostgresStore{Pool: pool}
	r := testReport(1)
	r.ErrorCode, r.SafeMessage, r.ErrorSource = "JS_PROPERTY_ACCESS", diagnosticMessages["JS_PROPERTY_ACCESS"], "javascript"
	var wg sync.WaitGroup
	failures := make(chan error, 32)
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); failures <- store.Save(ctx, r, fingerprint(r)) }()
	}
	wg.Wait()
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	var count int
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM client_error_reports").Scan(&count); err != nil || count != 1 {
		t.Fatalf("retries created %d rows: %v", count, err)
	}
	for i := 2; i <= 56; i++ {
		row := testReport(i)
		if i%2 == 0 {
			row.Platform = "android"
		}
		if err = store.Save(ctx, row, fingerprint(row)); err != nil {
			t.Fatal(err)
		}
	}
	// Same timestamp forces the UUID tiebreaker to be used across page boundaries.
	if _, err = pool.Exec(ctx, "UPDATE client_error_reports SET received_at=$1", time.Now().UTC().Truncate(time.Second)); err != nil {
		t.Fatal(err)
	}
	var cursor *Cursor
	seen := map[string]bool{}
	for {
		rows, err := store.List(ctx, "", cursor)
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) > 26 {
			t.Fatal("unbounded page")
		}
		more := len(rows) > 25
		if more {
			rows = rows[:25]
		}
		for _, row := range rows {
			if seen[row.ID] {
				t.Fatal("duplicate across pages")
			}
			seen[row.ID] = true
			if row.ID == r.ID && (row.ErrorCode != r.ErrorCode || row.SafeMessage != r.SafeMessage || row.ErrorSource != r.ErrorSource) {
				t.Fatal("new diagnostic context lost during storage/list round trip")
			}
			if row.Fingerprint != fingerprint(row.Report) {
				t.Fatal("report changed on storage round trip")
			}
		}
		if !more {
			break
		}
		last := rows[len(rows)-1]
		cursor = &Cursor{Time: last.ReceivedAt, ID: last.ID}
	}
	if len(seen) != 56 {
		t.Fatalf("pagination lost reports: %d", len(seen))
	}
	ios, err := store.List(ctx, "ios", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range ios {
		if row.Platform != "ios" {
			t.Fatal("filter leaked other platform")
		}
	}
	if _, err = pool.Exec(ctx, "UPDATE client_error_reports SET received_at=now()-interval '31 days' WHERE id=$1", r.ID); err != nil {
		t.Fatal(err)
	}
	if err = store.Cleanup(ctx); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM client_error_reports").Scan(&count); err != nil || count != 55 {
		t.Fatalf("cleanup count=%d err=%v", count, err)
	}
}
