package router_test

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"
)

func TestDiagnosticsRoutesEnforcePrivacyAndRateLimits(t *testing.T) {
	const key = "diagnostics-qa-only-signing-key-32-characters"
	t.Setenv("JWT_SECRET", key)
	var cfg router.HandlersConfig
	stub := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	fields := reflect.ValueOf(&cfg).Elem()
	for i := 0; i < fields.NumField(); i++ {
		if fields.Field(i).Type() == reflect.TypeOf(stub) {
			fields.Field(i).Set(reflect.ValueOf(stub))
		}
	}
	cfg.AuthMiddleware = auth.AuthMiddleware
	cfg.OptionalAuthMiddleware = auth.OptionalAuthMiddleware
	cfg.ScannerAuthMiddleware = auth.ScannerAuthMiddleware
	cfg.OrganizerMiddleware = auth.RequireRole("organizer", "admin")
	cfg.AdminMiddleware = auth.RequireRole("admin")
	limits := map[string]int{}
	globalCalls := 0
	limit := func(scope string, count int, window time.Duration) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				limits[scope] = count
				if r.Header.Get("X-Test-Limit") == scope {
					w.WriteHeader(429)
					return
				}
				next.ServeHTTP(w, r)
			})
		}
	}
	cfg.RateLimit = limit
	cfg.IdentityRateLimit = limit
	cfg.DiagnosticRateLimit = func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			globalCalls++
			if r.Header.Get("X-Test-Limit") == "global" {
				w.WriteHeader(429)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
	handler := router.SetupRouter(cfg)
	for _, role := range []string{"", "user", "organizer", "admin"} {
		r := httptest.NewRequest("GET", "/api/v1/admin/client-errors", nil)
		if role != "" {
			token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": "qa-user", "role": role, "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte(key))
			if err != nil {
				t.Fatal(err)
			}
			r.Header.Set("Authorization", "Bearer "+token)
		}
		want := 403
		if role == "" {
			want = 401
		} else if role == "admin" {
			want = 204
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("read role %q: got %d want %d", role, w.Code, want)
		}
		if role == "admin" {
			r.Header.Set("X-Test-Limit", "diagnostics_admin")
			w = httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != 429 {
				t.Fatal("admin bypassed rate limit")
			}
		}
	}
	for _, scope := range []string{"", "diagnostics_ip", "global"} {
		r := httptest.NewRequest("POST", "/api/v1/diagnostics/errors", nil)
		r.Header.Set("X-Test-Limit", scope)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		want := 429
		if scope == "" {
			want = 204
		}
		if w.Code != want {
			t.Fatalf("ingest scope %q: got %d want %d", scope, w.Code, want)
		}
	}
	if limits["diagnostics_ip"] != 60 || limits["diagnostics_admin"] != 60 || globalCalls != 2 {
		t.Fatalf("missing limits: %v global=%d", limits, globalCalls)
	}
	cfg.DiagnosticRateLimit = nil
	w := httptest.NewRecorder()
	router.SetupRouter(cfg).ServeHTTP(w, httptest.NewRequest("POST", "/api/v1/diagnostics/errors", nil))
	if w.Code != 404 && w.Code != 405 {
		t.Fatal("ingestion must be disabled without its global limit")
	}
}
