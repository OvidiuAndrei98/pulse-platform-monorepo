package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func TestSessionMiddlewareUsesCurrentAccountState(t *testing.T) {
	t.Setenv("JWT_SECRET", testJWTSecret)
	for _, scenario := range []struct {
		name        string
		version     any
		state       userSessionState
		lookupError error
		want        int
	}{
		{"current", "3", activeSessionState(3, "organizer"), nil, 204},
		{"revoked", "2", activeSessionState(3, "user"), nil, 401},
		{"legacy", nil, activeSessionState(3, "user"), nil, 401},
		{"numeric_version", 3, activeSessionState(3, "user"), nil, 401},
		{"zero_version", "0", activeSessionState(3, "user"), nil, 401},
		{"inactive", "3", userSessionState{version: 3, role: pgtype.Text{String: "user", Valid: true}}, nil, 401},
		{"unknown_role", "3", activeSessionState(3, "root"), nil, 401},
		{"deleted", "3", userSessionState{}, pgx.ErrNoRows, 401},
		{"database_error", "3", userSessionState{}, errors.New("database unavailable"), 503},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			claims := jwt.MapClaims{"sub": "ea79b1ed-99b1-4000-a000-000000000001", "role": "admin", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix()}
			if scenario.version != nil {
				claims["sv"] = scenario.version
			}
			token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testJWTSecret))
			if err != nil {
				t.Fatal(err)
			}
			lookup := func(_ context.Context, id pgtype.UUID) (userSessionState, error) {
				if id.String() != claims["sub"] {
					t.Fatal("wrong account lookup")
				}
				return scenario.state, scenario.lookupError
			}
			r := httptest.NewRequest("GET", "/", nil)
			r.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			sessionAuthMiddleware(lookup)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				role, _ := GetRoleFromContext(r.Context())
				if role != scenario.state.role.String {
					t.Fatal("trusted stale JWT role")
				}
				w.WriteHeader(204)
			})).ServeHTTP(w, r)
			if w.Code != scenario.want {
				t.Fatalf("status %d, want %d", w.Code, scenario.want)
			}
		})
	}
}

func activeSessionState(version int64, role string) userSessionState {
	return userSessionState{version: version, role: pgtype.Text{String: role, Valid: true}, active: pgtype.Bool{Bool: true, Valid: true}}
}

func TestOptionalSessionDoesNotBypassAuthentication(t *testing.T) {
	t.Setenv("JWT_SECRET", testJWTSecret)
	h := &Handler{}
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) })
	w := httptest.NewRecorder()
	h.OptionalAuthMiddleware(next).ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 204 {
		t.Fatal("anonymous read required a session")
	}
	if got := sessionStatus(h.OptionalAuthMiddleware, "invalid"); got != 401 {
		t.Fatalf("invalid token returned %d", got)
	}
	claims := jwt.MapClaims{"sub": "ea79b1ed-99b1-4000-a000-000000000001", "sv": "1", "role": "user", "exp": time.Now().Add(time.Hour).Unix()}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testJWTSecret))
	if err != nil {
		t.Fatal(err)
	}
	if got := sessionStatus(h.OptionalAuthMiddleware, token); got != 503 {
		t.Fatalf("unavailable session store returned %d", got)
	}
}
