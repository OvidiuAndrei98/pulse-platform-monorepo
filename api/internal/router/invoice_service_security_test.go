package router_test

import (
	"github.com/golang-jwt/jwt/v5"
	"net/http"
	"net/http/httptest"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestFreeInvoicingSettingsRequireOrganizer(t *testing.T) {
	const key = "commission-route-test-only-77522341aabbccddeeff99887766554433221100"
	t.Setenv("JWT_SECRET", key)
	var cfg router.HandlersConfig
	fields := reflect.ValueOf(&cfg).Elem()
	stub := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
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
	handler := router.SetupRouter(cfg)
	for _, role := range []string{"", "user", "organizer", "admin"} {
		token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": "ea79b1ed-99b1-4000-a000-000000000001", "role": role, "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte(key))
		for _, route := range []struct{ method, path string }{{"GET", "/dashboard/invoicing/settings"}, {"PUT", "/dashboard/invoicing/settings"}} {
			r := httptest.NewRequest(route.method, "/api/v1"+route.path, strings.NewReader(`{}`))
			if role != "" {
				r.Header.Set("Authorization", "Bearer "+token)
			}
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			want := 403
			if role == "" {
				want = 401
			}
			if role == "admin" || role == "organizer" {
				want = 204
			}
			if w.Code != want {
				t.Fatalf("%s %s: %d want %d", role, route.path, w.Code, want)
			}
		}
	}
}
