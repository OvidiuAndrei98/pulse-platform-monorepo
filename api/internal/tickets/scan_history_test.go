package tickets

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
)

func TestScanHistoryPageValidation(t *testing.T) {
	for _, query := range []string{"scope=other", "limit=0", "limit=101", "limit=-1", "limit=no", "cursor=", "cursor=broken", "cursor=" + base64.RawURLEncoding.EncodeToString([]byte(`{"id":"wrong","at":"2026-10-14T10:00:00Z"}`))} {
		if _, _, _, err := parseScanHistoryPage(httptest.NewRequest("GET", "/?"+query, nil)); err == nil {
			t.Errorf("accepted %s", query)
		}
	}
	value := scanHistoryCursor{At: time.Date(2026, 10, 14, 10, 0, 0, 123456000, time.UTC), ID: "00000000-0000-4000-8000-000000000001"}
	raw, _ := json.Marshal(value)
	scope, limit, cursor, err := parseScanHistoryPage(httptest.NewRequest("GET", "/?scope=mine&limit=100&cursor="+base64.RawURLEncoding.EncodeToString(raw), nil))
	if err != nil || scope != "mine" || limit != 100 || cursor == nil || !cursor.At.Equal(value.At) {
		t.Fatalf("cursor precision lost: %#v %v", cursor, err)
	}
	w := httptest.NewRecorder()
	(&Handler{}).HandleListValidationScans(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatal("unauthenticated history request allowed")
	}
}

func TestScanHistoryIntegration(t *testing.T) {
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
	cfg.MaxConns = 1
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	id := func(query string, args ...any) string {
		t.Helper()
		var id string
		if err := pool.QueryRow(ctx, query, args...).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, query, args...); err != nil {
			t.Fatal(err)
		}
	}
	suffix := fmt.Sprintf("history-%d", time.Now().UnixNano())
	user := func(name string) string {
		return id(`INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'unused','user',true) RETURNING id::text`, name+suffix, name+suffix+"@example.invalid")
	}
	owner, staff, outsider := user("owner"), user("staff"), user("outsider")
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1::uuid[])`, []string{owner, staff, outsider})
	}()
	event := id(`INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status) VALUES($1,'History QA','house','Test','Bucuresti','social',44,26,now(),now()+interval '1 day','history-qa','published') RETURNING id::text`, owner)
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM events WHERE id=$1`, event) }()
	exec(`INSERT INTO event_validation_staff(event_id,user_id,added_by) VALUES($1,$2,$3)`, event, staff, owner)
	tier := id(`INSERT INTO ticket_types(event_id,name,price_ron,capacity,tickets_sold,start_sales,end_sales) VALUES($1,'VIP',50,100,46,now(),now()+interval '1 day') RETURNING id::text`, event)
	order := id(`INSERT INTO orders(user_id,event_id,email,status,total_amount) VALUES($1,$2,'history@example.invalid','completed',2300) RETURNING id::text`, owner, event)
	defer func() { _, _ = pool.Exec(ctx, `DELETE FROM orders WHERE id=$1`, order) }()
	access := id(`INSERT INTO event_scanner_access(event_id,created_by,label,token_hash,starts_at,ends_at) VALUES($1,$2,'North entrance',md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),now(),now()+interval '1 day') RETURNING id::text`, event, owner)
	// Identical timestamps exercise the UUID tie-breaker, including page edges.
	exec(`INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash,is_validated,validated_at,validated_by_user_id,validated_by_scanner_access_id)
	 SELECT $1,$2,$3,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text),true,'2026-10-14T01:00:00.123456Z',
	 CASE WHEN n%5=0 THEN NULL WHEN n%2=0 THEN $4::uuid ELSE $3::uuid END, CASE WHEN n%5=0 THEN $5::uuid ELSE NULL END FROM generate_series(1,45) n`, order, tier, owner, staff, access)
	exec(`INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash) VALUES($1,$2,$3,md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text))`, order, tier, owner)
	h := NewHandler(db.New(pool), pool, "https://example.invalid")
	request := func(user, event, query string, legacy bool) (int, ValidationScanHistoryResponse) {
		t.Helper()
		r := httptest.NewRequest("GET", "/history?"+query, nil)
		route := chi.NewRouteContext()
		route.URLParams.Add("id", event)
		requestCtx := context.WithValue(ctx, auth.UserIDKey, user)
		requestCtx = context.WithValue(requestCtx, chi.RouteCtxKey, route)
		w := httptest.NewRecorder()
		if legacy {
			h.HandleListMyValidationScans(w, r.WithContext(requestCtx))
		} else {
			h.HandleListValidationScans(w, r.WithContext(requestCtx))
		}
		var result ValidationScanHistoryResponse
		if w.Code == 200 {
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("private history cached")
			}
		}
		if w.Code == 500 {
			t.Fatal(w.Body.String())
		}
		return w.Code, result
	}
	code, first := request(staff, event, "scope=all&limit=7", false)
	if code != 200 || first.TotalScans != 45 || len(first.Scans) != 7 || first.NextCursor == "" {
		t.Fatalf("first page: %d %#v", code, first)
	}
	seen := map[string]bool{}
	kinds := map[string]bool{}
	page := first
	for {
		for _, scan := range page.Scans {
			if seen[scan.TicketID] {
				t.Fatal("duplicate ticket across pages")
			}
			seen[scan.TicketID] = true
			kinds[scan.ScannedBy.Kind] = true
			if scan.ScannedBy.Name == "" {
				t.Fatal("missing actor name")
			}
			if scan.ScannedBy.Kind == "access" && scan.ScannedBy.Name != "North entrance" {
				t.Fatal("quick access attributed to organizer")
			}
		}
		if page.NextCursor == "" {
			break
		}
		_, page = request(staff, event, "scope=all&limit=7&cursor="+url.QueryEscape(page.NextCursor), false)
	}
	if len(seen) != 45 || !kinds["user"] || !kinds["access"] {
		t.Fatalf("incomplete history: %d %v", len(seen), kinds)
	}
	_, mine := request(staff, event, "scope=mine&userId="+owner, false)
	if mine.TotalScans != 18 || len(mine.Scans) != 18 {
		t.Fatalf("wrong personal total: %#v", mine)
	}
	for _, scan := range mine.Scans {
		if scan.ScannedBy.UserID != staff {
			t.Fatal("mine leaks another scanner's tickets")
		}
	}
	_, legacy := request(staff, event, "scope=all", true)
	if legacy.TotalScans != mine.TotalScans {
		t.Fatal("legacy personal scope changed")
	}
	// Adding a newer scan cannot shift the next page as offset pagination would.
	exec(`UPDATE tickets SET is_validated=true,validated_at='2026-10-14T02:00:00Z',validated_by_user_id=$2 WHERE order_id=$1 AND is_validated=false`, order, staff)
	_, next := request(staff, event, "scope=all&limit=100&cursor="+url.QueryEscape(first.NextCursor), false)
	if len(next.Scans) != 38 || next.TotalScans != 46 {
		t.Fatal("concurrent scan shifts cursor page")
	}
	for _, scan := range first.Scans {
		for _, other := range next.Scans {
			if scan.TicketID == other.TicketID {
				t.Fatal("concurrent scan duplicates a page")
			}
		}
	}
	if code, _ := request(outsider, event, "scope=all", false); code != 403 {
		t.Fatal("unassigned user can read history")
	}
	exec(`DELETE FROM event_validation_staff WHERE event_id=$1 AND user_id=$2`, event, staff)
	if code, _ := request(staff, event, "scope=all&cursor="+url.QueryEscape(first.NextCursor), false); code != 403 {
		t.Fatal("revoked scanner can paginate")
	}
	if code, _ := request(owner, event, "scope=all", false); code != 200 {
		t.Fatal("owner cannot read history")
	}
}
