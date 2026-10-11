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

func TestPlacesRoutesRequireOrganizerAndIdentityRateLimit(t *testing.T) {
	const key = "a88def974d82ebf23f55dd21cfa8d5b4a6101144a0b4bc47e758d73836f2e758"
	t.Setenv("JWT_SECRET", key)
	var cfg router.HandlersConfig
	stub := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
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
	cfg.IdentityRateLimit = func(scope string, limit int, window time.Duration) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				limits[scope] = limit
				if r.Header.Get("X-Test-Limit") == "yes" {
					w.WriteHeader(http.StatusTooManyRequests)
					return
				}
				next.ServeHTTP(w, r)
			})
		}
	}
	handler := router.SetupRouter(cfg)
	for _, route := range []string{"autocomplete", "details"} {
		for _, role := range []string{"", "user", "organizer", "admin"} {
			r := httptest.NewRequest(http.MethodGet, "/api/v1/dashboard/places/"+route, nil)
			if role != "" {
				token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": "user-id", "role": role, "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte(key))
				if err != nil {
					t.Fatal(err)
				}
				r.Header.Set("Authorization", "Bearer "+token)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			want := http.StatusNoContent
			if role == "" {
				want = http.StatusUnauthorized
			} else if role == "user" {
				want = http.StatusForbidden
			}
			if w.Code != want {
				t.Fatalf("%s role %q: want %d got %d", route, role, want, w.Code)
			}
			if role == "organizer" {
				r.Header.Set("X-Test-Limit", "yes")
				w = httptest.NewRecorder()
				handler.ServeHTTP(w, r)
				if w.Code != 429 {
					t.Fatal("Places request bypassed identity rate limit")
				}
			}
		}
	}
	if limits["places_search"] != 60 || limits["places_details"] != 30 {
		t.Fatalf("missing Places rate limits: %v", limits)
	}
}
