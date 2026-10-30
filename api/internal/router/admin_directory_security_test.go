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

func TestAdminDirectoryRoutesRequireAdministrator(t *testing.T) {
	const key = "directory-test-secret-at-least-32-characters"
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
	cfg.AdminMiddleware = auth.RequireRole("admin")
	cfg.OrganizerMiddleware = auth.RequireRole("organizer", "admin")
	h := router.SetupRouter(cfg)
	for _, role := range []string{"", "user", "organizer", "admin"} {
		for _, method := range []string{"POST", "GET"} {
			path := "/api/v1/admin/organizer-directory"
			if method == "GET" {
				path += "/11111111-1111-4111-8111-111111111111"
			}
			r := httptest.NewRequest(method, path, strings.NewReader("{}"))
			if role != "" {
				token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": "11111111-1111-4111-8111-111111111111", "role": role, "exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte(key))
				if err != nil {
					t.Fatal(err)
				}
				r.Header.Set("Authorization", "Bearer "+token)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			want := 403
			if role == "" {
				want = 401
			}
			if role == "admin" {
				want = 204
			}
			if w.Code != want {
				t.Fatalf("%s %s got %d, want %d", role, method, w.Code, want)
			}
		}
	}
}
