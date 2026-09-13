package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
)

const testJWTSecret = "bd31830da167ad354706452a26641692d1607864f285e3bd916a849e5cbfa1038"

func TestJWTSigningKeyFailClosed(t *testing.T) {
	for _, secret := range []string{"", "short", strings.Repeat("x", 31), testJWTSecret + "\n", " " + testJWTSecret, strings.Repeat("change-me", 5)} {
		t.Setenv("JWT_SECRET", secret)
		if _, err := JWTSigningKey(); err == nil {
			t.Fatal("unsafe key accepted")
		}
		if _, err := issueUserJWT(db.Users{}); err == nil {
			t.Fatal("issued session with unsafe key")
		}
		for _, middleware := range []func(http.Handler) http.Handler{AuthMiddleware, ScannerAuthMiddleware} {
			token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"sub": "user", "exp": time.Now().Add(time.Hour).Unix(), "scope": "scanner", "scanner_access_id": "gate", "event_id": "event"}).SignedString([]byte(secret))
			if err != nil {
				t.Fatal(err)
			}
			if status := sessionStatus(middleware, token); status != 401 {
				t.Fatalf("unsafe key authenticated: %d", status)
			}
		}
	}
	t.Setenv("JWT_SECRET", testJWTSecret)
	key, err := JWTSigningKey()
	if err != nil || string(key) != testJWTSecret {
		t.Fatal("valid key changed/rejected")
	}
}

func sessionStatus(middleware func(http.Handler) http.Handler, token string) int {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })).ServeHTTP(w, r)
	return w.Code
}

func TestSessionValidation(t *testing.T) {
	t.Setenv("JWT_SECRET", testJWTSecret)
	for _, scanner := range []bool{false, true} {
		middleware := AuthMiddleware
		if scanner {
			middleware = ScannerAuthMiddleware
		}
		for _, scenario := range []string{"valid", "expired", "no_exp", "wrong_key", "HS384", "future_iat", "wrong_scope", "missing_identity"} {
			t.Run(map[bool]string{true: "scanner/", false: "user/"}[scanner]+scenario, func(t *testing.T) {
				claims := jwt.MapClaims{"sub": "test-user", "role": "user", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix()}
				if scanner {
					claims["scope"] = "scanner"
					claims["scanner_access_id"] = "gate"
					claims["event_id"] = "event"
				}
				var method jwt.SigningMethod = jwt.SigningMethodHS256
				key := testJWTSecret
				switch scenario {
				case "expired":
					claims["exp"] = time.Now().Add(-time.Hour).Unix()
				case "no_exp":
					delete(claims, "exp")
				case "wrong_key":
					key = strings.Repeat("z", 32)
				case "HS384":
					method = jwt.SigningMethodHS384
				case "future_iat":
					claims["iat"] = time.Now().Add(time.Hour).Unix()
				case "wrong_scope":
					if scanner {
						delete(claims, "scope")
					} else {
						claims["scope"] = "scanner"
					}
				case "missing_identity":
					if scanner {
						delete(claims, "event_id")
					} else {
						claims["sub"] = ""
					}
				}
				token, err := jwt.NewWithClaims(method, claims).SignedString([]byte(key))
				if err != nil {
					t.Fatal(err)
				}
				want := 401
				if scenario == "valid" {
					want = 204
				}
				if got := sessionStatus(middleware, token); got != want {
					t.Fatalf("status %d, want %d", got, want)
				}
			})
		}
	}
	var id pgtype.UUID
	if err := id.Scan("ea79b1ed-99b1-4000-a000-000000000001"); err != nil {
		t.Fatal(err)
	}
	token, err := issueUserJWT(db.Users{ID: id, Role: pgtype.Text{String: "user", Valid: true}})
	if err != nil || sessionStatus(AuthMiddleware, token) != 204 {
		t.Fatal("real user session rejected", err)
	}
}
