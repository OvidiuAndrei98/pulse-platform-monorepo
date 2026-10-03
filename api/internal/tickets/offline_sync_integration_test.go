package tickets

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
)

func TestOfflineSyncAfterExpiryIntegration(t *testing.T) {
	dsn := os.Getenv("TICKET_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires a migrated local spottr_ticket_test database")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_ticket_test" {
		t.Fatal("refusing non-isolated test database")
	}
	ctx := context.Background()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	id := func(query string, args ...any) string {
		t.Helper()
		var value string
		if err := pool.QueryRow(ctx, query, args...).Scan(&value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	suffix := fmt.Sprintf("offline-%d", time.Now().UnixNano())
	owner := id(`INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'unused','organizer',TRUE) RETURNING id::text`, suffix, suffix+"@example.invalid")
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner) }()
	event := id(`INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status)
		VALUES($1,'Offline sync','house','Test','Bucuresti','social',44,26,now()-interval '4 hours',now()-interval '2 hours','offline-test','published') RETURNING id::text`, owner)
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM events WHERE id=$1`, event) }()
	tier := id(`INSERT INTO ticket_types(event_id,name,price_ron,capacity,tickets_sold,start_sales,end_sales) VALUES($1,'General',50,100,1,now()-interval '1 day',now()-interval '2 hours') RETURNING id::text`, event)
	order := id(`INSERT INTO orders(user_id,event_id,email,status,total_amount) VALUES($1,$2,'offline@example.invalid','completed',50) RETURNING id::text`, owner, event)
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM orders WHERE id=$1`, order) }()
	hash := strings.Repeat("a", 64)
	exec(`INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash) VALUES($1,$2,$3,$4)`, order, tier, owner, hash)
	expires := time.Now().Add(-time.Hour).UTC().Truncate(time.Second)
	snapshot := id(`INSERT INTO offline_validation_snapshots(event_id,created_by_user_id,ticket_count,created_at,expires_at) VALUES($1,$2,1,$3,$4) RETURNING id::text`, event, owner, expires.Add(-3*time.Hour), expires)
	scanID := id(`SELECT gen_random_uuid()::text`)
	scan := OfflineTicketScanPayload{ClientScanID: scanID, ValidationHash: hash, ScannedAt: expires.Add(-time.Hour).Format(time.RFC3339)}
	handler := NewHandler(db.New(pool), pool, "https://example.invalid")
	request := func(scans []OfflineTicketScanPayload) *httptest.ResponseRecorder {
		payload, err := json.Marshal(SyncOfflineTicketScansRequest{SnapshotID: snapshot, DeviceID: "test-device", Scans: scans})
		if err != nil {
			t.Fatal(err)
		}
		r := httptest.NewRequest(http.MethodPost, "/offline-sync", bytes.NewReader(payload))
		route := chi.NewRouteContext()
		route.URLParams.Add("id", event)
		requestCtx := context.WithValue(ctx, auth.UserIDKey, owner)
		requestCtx = context.WithValue(requestCtx, chi.RouteCtxKey, route)
		w := httptest.NewRecorder()
		handler.HandleSyncOfflineScans(w, r.WithContext(requestCtx))
		return w
	}
	for attempt := 0; attempt < 2; attempt++ {
		response := request([]OfflineTicketScanPayload{scan})
		if response.Code != http.StatusOK {
			t.Fatalf("delayed sync/retry: %d %s", response.Code, response.Body.String())
		}
		var result SyncOfflineTicketScansResponse
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if len(result.Results) != 1 || result.Results[0].Status != "accepted" {
			t.Fatalf("retry must retain accepted result: %#v", result.Results)
		}
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM offline_ticket_validations WHERE snapshot_id=$1`, snapshot).Scan(&count); err != nil || count != 1 {
		t.Fatalf("idempotency count=%d err=%v", count, err)
	}
	scan.ScannedAt = expires.Format(time.RFC3339)
	if response := request([]OfflineTicketScanPayload{scan}); response.Code != http.StatusBadRequest {
		t.Fatalf("scan at expiry accepted: %d", response.Code)
	}
	scan.ScannedAt = expires.Add(-time.Hour).Format(time.RFC3339)
	if response := request(make([]OfflineTicketScanPayload, 201)); response.Code != http.StatusBadRequest {
		t.Fatalf("oversize batch accepted: %d", response.Code)
	}
	if response := request(nil); response.Code != http.StatusBadRequest {
		t.Fatalf("empty batch accepted: %d", response.Code)
	}
}
