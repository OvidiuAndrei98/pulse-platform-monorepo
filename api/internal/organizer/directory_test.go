package organizer

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
)

func directoryRequest(handler http.HandlerFunc, method, body, role, id string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/admin/organizer-directory", strings.NewReader(body))
	ctx := context.WithValue(r.Context(), auth.RoleKey, role)
	ctx = context.WithValue(ctx, auth.UserIDKey, "11111111-1111-4111-8111-111111111111")
	params := chi.NewRouteContext()
	params.URLParams.Add("id", id)
	ctx = context.WithValue(ctx, chi.RouteCtxKey, params)
	w := httptest.NewRecorder()
	handler(w, r.WithContext(ctx))
	return w
}

func TestDirectoryRejectsUnauthorizedAndMalformedInputBeforeDatabase(t *testing.T) {
	h := &Handler{}
	for _, role := range []string{"", "user", "organizer"} {
		for _, handler := range []http.HandlerFunc{h.HandleAdminOrganizerDirectory, h.HandleAdminOrganizerDetail} {
			w := directoryRequest(handler, "POST", "{}", role, "11111111-1111-4111-8111-111111111111")
			if w.Code != 403 || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("directory did not fail closed")
			}
		}
	}
	for _, body := range []string{``, `{} {}`, `{"extra":"private"}`, `{"status":"private"}`, `{"after":"not-a-uuid"}`, `{"search":"` + strings.Repeat("x", 201) + `"}`, `{"search":"bad\nsearch"}`, `{"search":12}`, strings.Repeat(" ", 4097)} {
		want := 400
		if len(body) > 4096 {
			want = 413
		}
		if w := directoryRequest(h.HandleAdminOrganizerDirectory, "POST", body, "admin", ""); w.Code != want {
			t.Fatalf("malformed search accepted: %d", w.Code)
		}
	}
	if w := directoryRequest(h.HandleAdminOrganizerDetail, "GET", "", "admin", "invalid"); w.Code != 400 {
		t.Fatal("invalid detail identifier accepted")
	}
}

func TestDirectoryPaginationIsolationAndPrivateFieldAllowlist(t *testing.T) {
	pool := organizerIsolationPool(t)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	h := NewHandler(db.New(tx))
	suffix := fmt.Sprint(time.Now().UnixNano())
	ids := make([]pgtype.UUID, 27)
	for i := range ids {
		if err := tx.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,google_id,role,is_active) VALUES($1,$2,'NEVER_EXPORT_PASSWORD',$3,'organizer',TRUE) RETURNING id`, fmt.Sprintf("dir-%s-%d", suffix, i), fmt.Sprintf("dir-%s-%d@example.invalid", suffix, i), fmt.Sprintf("NEVER_EXPORT_GOOGLE_%s_%d", suffix, i)).Scan(&ids[i]); err != nil {
			t.Fatal(err)
		}
		status := "pending"
		if i == 26 {
			status = "approved"
		}
		if _, err := tx.Exec(ctx, `INSERT INTO organizer_profiles(user_id,cui,company_name,fiscal_address,verification_status,organizer_agreement_accepted_ip) VALUES($1,$2,$3,'Fiscal address',$4,'10.19.0.10')`, ids[i], fmt.Sprintf("%s%02d", suffix[len(suffix)-8:], i), fmt.Sprintf("Directory %s %02d", suffix, i), status); err != nil {
			t.Fatal(err)
		}
	}
	seen := map[string]bool{}
	after := ""
	for page := 0; page < 2; page++ {
		body, _ := json.Marshal(DirectorySearch{Search: suffix, Status: "all", After: after})
		w := directoryRequest(h.HandleAdminOrganizerDirectory, "POST", string(body), "admin", "")
		if w.Code != 200 {
			t.Fatalf("list: %d %s", w.Code, w.Body)
		}
		var result DirectoryPage
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if page == 0 && (len(result.Items) != 25 || result.NextCursor == "") || page == 1 && (len(result.Items) != 2 || result.NextCursor != "") {
			t.Fatal("unbounded or incomplete pagination")
		}
		for _, row := range result.Items {
			if seen[row.UserID] {
				t.Fatal("duplicate across pages")
			}
			seen[row.UserID] = true
		}
		for _, secret := range []string{"NEVER_EXPORT", "password", "google", "10.19.0.10", "stripeAccountId"} {
			if strings.Contains(w.Body.String(), secret) {
				t.Fatalf("directory exposed %s", secret)
			}
		}
		after = result.NextCursor
	}
	if len(seen) != 27 {
		t.Fatal("directory lost rows")
	}
	var events [2]pgtype.UUID
	for i := range events {
		if err := tx.QueryRow(ctx, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,status) VALUES($1,$2,'house','Venue','Bucuresti','social',44,26,now()+interval '1 day',now()+interval '2 days','published') RETURNING id`, ids[i], fmt.Sprintf("OWNER_%d_ONLY_EVENT", i)).Scan(&events[i]); err != nil {
			t.Fatal(err)
		}
	}
	for i, live := range []any{true, false, nil} {
		if _, err := tx.Exec(ctx, `INSERT INTO orders(event_id,email,status,total_amount,stripe_refund_needs_attention,stripe_livemode) VALUES($1,$2,'completed',10,TRUE,$3)`, events[0], fmt.Sprintf("NEVER_EXPORT_BUYER_%d@example.invalid", i), live); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO orders(event_id,email,status,total_amount,stripe_refund_needs_attention,stripe_livemode) VALUES($1,'NEVER_EXPORT_OTHER_BUYER@example.invalid','completed',10,TRUE,TRUE)`, events[1]); err != nil {
		t.Fatal(err)
	}
	w := directoryRequest(h.HandleAdminOrganizerDetail, "GET", "", "admin", ids[0].String())
	if w.Code != 200 {
		t.Fatalf("detail: %d %s", w.Code, w.Body)
	}
	var detail DirectoryDetail
	if err := json.Unmarshal(w.Body.Bytes(), &detail); err != nil {
		t.Fatal(err)
	}
	if detail.EventCount != 1 || detail.UpcomingCount != 1 || detail.LiveRefundsAttention != 1 || detail.TestRefundsAttention != 1 || detail.UnknownRefundsAttention != 1 || len(detail.RecentEvents) != 1 || detail.RecentEvents[0].Title != "OWNER_0_ONLY_EVENT" {
		t.Fatal("aggregate leakage, fanout, or live/test mixing")
	}
	for _, secret := range []string{"NEVER_EXPORT", "OWNER_1_ONLY_EVENT", "10.19.0.10", "credentials", "password", "google"} {
		if strings.Contains(w.Body.String(), secret) {
			t.Fatalf("detail exposed %s", secret)
		}
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private detail can be cached")
	}
	if w := directoryRequest(h.HandleAdminOrganizerDetail, "GET", "", "admin", "11111111-1111-4111-8111-111111111111"); w.Code != 404 {
		t.Fatal("missing organizer must return 404")
	}
	filter, _ := json.Marshal(DirectorySearch{Search: suffix, Status: "approved"})
	w = directoryRequest(h.HandleAdminOrganizerDirectory, "POST", string(filter), "admin", "")
	var filtered DirectoryPage
	_ = json.Unmarshal(w.Body.Bytes(), &filtered)
	if w.Code != 200 || len(filtered.Items) != 1 || filtered.Items[0].UserID != ids[26].String() {
		t.Fatal("verification filter was not applied")
	}
}
