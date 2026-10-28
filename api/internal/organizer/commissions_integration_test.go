package organizer

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"net/http"
	"net/http/httptest"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"strings"
	"testing"
	"time"
)

func commissionRequest(h *Handler, method string, actor pgtype.UUID, role, target, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, "/", strings.NewReader(body))
	ctx := context.WithValue(r.Context(), auth.UserIDKey, actor.String())
	ctx = context.WithValue(ctx, auth.RoleKey, role)
	route := chi.NewRouteContext()
	route.URLParams.Add("id", target)
	r = r.WithContext(context.WithValue(ctx, chi.RouteCtxKey, route))
	w := httptest.NewRecorder()
	if method == "GET" {
		h.HandleAdminCommissions(w, r)
	} else if target == "" {
		h.HandleAdminSetStandardCommission(w, r)
	} else {
		h.HandleAdminSetOrganizerCommission(w, r)
	}
	return w
}
func TestCommissionAuthorizationAndValidationBeforeDatabase(t *testing.T) {
	var actor pgtype.UUID
	_ = actor.Scan("ea79b1ed-99b1-4000-a000-000000000001")
	h := NewHandler(nil)
	for _, role := range []string{"", "user", "organizer"} {
		for _, method := range []string{"GET", "PUT"} {
			for _, target := range []string{"", actor.String()} {
				if w := commissionRequest(h, method, actor, role, target, `{"rateBps":100,"perTicketBani":0,"revision":1}`); w.Code != 403 {
					t.Fatalf("role %s: %d", role, w.Code)
				}
			}
		}
	}
	for _, body := range []string{`{}`, `null`, `{"rateBps":-1,"perTicketBani":0,"revision":1}`, `{"rateBps":10001,"perTicketBani":0,"revision":1}`, `{"rateBps":1.5,"perTicketBani":0,"revision":1}`, `{"rateBps":0,"perTicketBani":100001,"revision":1}`, `{"rateBps":0,"perTicketBani":0}`, `{"rateBps":0,"perTicketBani":0,"revision":1} {}`} {
		if w := commissionRequest(h, "PUT", actor, "admin", "", body); w.Code != 400 {
			t.Fatalf("accepted %s: %d", body, w.Code)
		}
	}
	for _, body := range []string{`{}`, `{"revision":0}`, `{"override":{},"revision":0}`, `{"override":{"rateBps":-1,"perTicketBani":0},"revision":0}`} {
		if w := commissionRequest(h, "PUT", actor, "admin", actor.String(), body); w.Code != 400 {
			t.Fatalf("accepted override %s: %d", body, w.Code)
		}
	}
}
func TestCommissionInheritanceResetConflictAndAudit(t *testing.T) {
	pool := organizerIsolationPool(t)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	q := db.New(tx)
	h := NewHandler(q)
	var actor, first, second pgtype.UUID
	for i, id := range []*pgtype.UUID{&actor, &first, &second} {
		suffix := fmt.Sprintf("commission-%d-%d", time.Now().UnixNano(), i)
		role := "organizer"
		if i == 0 {
			role = "admin"
		}
		if err := tx.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'unused',$3,true) RETURNING id`, suffix, suffix+"@example.invalid", role).Scan(id); err != nil {
			t.Fatal(err)
		}
		if i > 0 {
			if _, err := tx.Exec(ctx, `INSERT INTO organizer_profiles(user_id,cui,company_name,fiscal_address) VALUES($1,$2,$3,'Test')`, *id, fmt.Sprintf("C%d%d", time.Now().UnixNano()%1000000000000, i), suffix); err != nil {
				t.Fatal(err)
			}
		}
	}
	current, err := q.GetStandardCommission(ctx)
	if err != nil {
		t.Fatal(err)
	}
	assertFee := func(id pgtype.UUID, rate, fixed int32) {
		t.Helper()
		result, err := q.GetEffectiveCommission(ctx, id)
		if err != nil || result.RateBps != rate || result.PerTicketBani != fixed {
			t.Fatalf("effective %+v, err=%v; want %d/%d", result, err, rate, fixed)
		}
	}
	call := func(target, body string, want int) {
		t.Helper()
		w := commissionRequest(h, "PUT", actor, "admin", target, body)
		if w.Code != want {
			t.Fatalf("status %d want %d: %s", w.Code, want, w.Body.String())
		}
	}
	assertFee(first, current.RateBps, current.PerTicketBani)
	call(first.String(), `{"override":{"rateBps":225,"perTicketBani":100},"revision":0}`, 200)
	assertFee(first, 225, 100)
	call("", fmt.Sprintf(`{"rateBps":600,"perTicketBani":300,"revision":%d}`, current.Revision), 200)
	assertFee(first, 225, 100)
	assertFee(second, 600, 300)
	call("", fmt.Sprintf(`{"rateBps":900,"perTicketBani":300,"revision":%d}`, current.Revision), 409)
	call(first.String(), `{"override":null,"revision":0}`, 409)
	assertFee(first, 225, 100)
	call(first.String(), `{"override":null,"revision":1}`, 200)
	assertFee(first, 600, 300)
	call("", fmt.Sprintf(`{"rateBps":700,"perTicketBani":400,"revision":%d}`, current.Revision+1), 200)
	assertFee(first, 700, 400)
	assertFee(second, 700, 400)
	// A negotiated zero is distinct from inheritance.
	call(first.String(), `{"override":{"rateBps":0,"perTicketBani":0},"revision":2}`, 200)
	assertFee(first, 0, 0)
	w := commissionRequest(h, http.MethodGet, actor, "admin", "", "")
	var settings CommissionSettings
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &settings) != nil {
		t.Fatal(w.Body.String())
	}
	found := false
	for _, row := range settings.Organizers {
		if row.OrganizerID == first.String() {
			found = true
			if row.Override == nil || row.Override.RateBps != 0 || row.Revision != 3 {
				t.Fatalf("lost zero override: %+v", row)
			}
		}
	}
	if !found {
		t.Fatal("organizer missing")
	}
	var audits int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM commission_change_log WHERE changed_by=$1`, actor).Scan(&audits); err != nil || audits != 5 {
		t.Fatalf("audit count %d: %v", audits, err)
	}
}
