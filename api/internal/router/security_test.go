package router_test

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"pulse-api/internal/auth"
	"pulse-api/internal/router"
)

func TestLegacyCreateUserRouteRemoved(t *testing.T) {
	const key = "a88def974d82ebf23f55dd21cfa8d5b4a6101144a0b4bc47e758d73836f2e758"
	t.Setenv("JWT_SECRET", key)
	var cfg router.HandlersConfig
	// All real routes get a sentinel handler; this test checks actual registration,
	// not a copy of the production routing tree.
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
	for _, role := range []string{"user", "organizer", "admin"} {
		token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": "user-id", "role": role, "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte(key))
		if err != nil {
			t.Fatal(err)
		}
		for _, path := range []string{"/api/v1/users", "/api/v1/users/"} {
			r := httptest.NewRequest("POST", path, strings.NewReader(`{"role":"admin","is_active":true,"password_hash":"attacker"}`))
			r.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, r)
			if w.Code != 404 && w.Code != 405 {
				t.Fatalf("%s %s still reachable: %d", role, path, w.Code)
			}
		}
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("POST", "/api/v1/auth/register", strings.NewReader(`{}`)))
	if w.Code != 204 {
		t.Fatalf("registration route lost: %d", w.Code)
	}
}
