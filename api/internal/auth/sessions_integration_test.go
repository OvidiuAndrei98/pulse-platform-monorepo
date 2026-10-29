package auth

import (
	"context"
	"fmt"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	db "pulse-api/db/generated"
)

func TestPasswordResetRevokesSessionsAndRejectsStaleLogin(t *testing.T) {
	t.Setenv("JWT_SECRET", testJWTSecret)
	h, _, _ := securityDB(t)
	user, resetToken, _ := seedReset(t, h)
	token, err := h.issueUserSession(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	if got := sessionStatus(h.AuthMiddleware, token); got != 204 {
		t.Fatalf("initial session returned %d", got)
	}
	w := authRequest(h.ResetPassword, fmt.Sprintf(`{"token":%q,"new_password":"replacement-password"}`, resetToken))
	if w.Code != 200 {
		t.Fatalf("reset status %d", w.Code)
	}
	if got := sessionStatus(h.AuthMiddleware, token); got != 401 {
		t.Fatalf("pre-reset session returned %d", got)
	}
	if _, err := h.issueUserSession(context.Background(), user); err == nil {
		t.Fatal("old password identity acquired the new session version")
	}
	updated, err := h.Queries.GetUserByID(context.Background(), user.ID)
	if err != nil {
		t.Fatal(err)
	}
	freshToken, err := h.issueUserSession(context.Background(), updated)
	if err != nil {
		t.Fatal(err)
	}
	if got := sessionStatus(h.AuthMiddleware, freshToken); got != 204 {
		t.Fatalf("new session returned %d", got)
	}
}

func TestAccountChangesCannotReviveOldSessions(t *testing.T) {
	t.Setenv("JWT_SECRET", testJWTSecret)
	h, pool, _ := securityDB(t)
	user, _, _ := seedReset(t, h)
	issueCurrent := func() string {
		t.Helper()
		current, err := h.Queries.GetUserByID(context.Background(), user.ID)
		if err != nil {
			t.Fatal(err)
		}
		token, err := h.issueUserSession(context.Background(), current)
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	exec := func(sql string) {
		t.Helper()
		if _, err := pool.Exec(context.Background(), sql, user.ID); err != nil {
			t.Fatal(err)
		}
	}
	userToken := issueCurrent()
	exec(`UPDATE users SET username = 'renamed-user' WHERE id=$1`)
	if got := sessionStatus(h.AuthMiddleware, userToken); got != 204 {
		t.Fatal("display-name change revoked the session")
	}
	exec(`UPDATE users SET role = 'admin' WHERE id=$1`)
	if got := sessionStatus(h.AuthMiddleware, userToken); got != 401 {
		t.Fatal("old role session survived promotion")
	}
	adminToken := issueCurrent()
	exec(`UPDATE users SET role = 'user' WHERE id=$1`)
	if got := sessionStatus(h.AuthMiddleware, adminToken); got != 401 {
		t.Fatal("admin session survived demotion")
	}
	if got := sessionStatus(h.AuthMiddleware, userToken); got != 401 {
		t.Fatal("reverting role revived a prior session")
	}
	activeToken := issueCurrent()
	exec(`UPDATE users SET is_active = false WHERE id=$1`)
	if got := sessionStatus(h.AuthMiddleware, activeToken); got != 401 {
		t.Fatal("inactive account kept its session")
	}
	current, err := h.Queries.GetUserByID(context.Background(), user.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.issueUserSession(context.Background(), current); err == nil {
		t.Fatal("issued a session for an inactive account")
	}
	exec(`UPDATE users SET is_active = true WHERE id=$1`)
	if got := sessionStatus(h.AuthMiddleware, activeToken); got != 401 {
		t.Fatal("reactivation revived the old session")
	}
	finalToken := issueCurrent()
	// The minimal auth fixture's token FK has no cascade, unlike the production
	// account deletion workflow. Remove fixture reset tokens before deleting.
	if err := db.New(pool).DeleteUserPasswordResetTokens(context.Background(), user.ID); err != nil {
		t.Fatal(err)
	}
	exec(`DELETE FROM users WHERE id=$1`)
	if got := sessionStatus(h.AuthMiddleware, finalToken); got != 401 {
		t.Fatal("deleted account kept its session")
	}
}

func TestSessionVersionChangesRollbackWithAccountUpdate(t *testing.T) {
	t.Setenv("JWT_SECRET", testJWTSecret)
	h, pool, _ := securityDB(t)
	user, _, _ := seedReset(t, h)
	token, err := h.issueUserSession(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err := tx.Exec(context.Background(), `UPDATE users SET password_hash='never-committed' WHERE id=$1`, user.ID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := sessionStatus(h.AuthMiddleware, token); got != 204 {
		t.Fatal("rolled-back password change revoked the session")
	}
}

func TestGoogleLoginCannotReactivateDisabledAccountsOrReplaceIdentity(t *testing.T) {
	for _, linked := range []bool{false, true} {
		t.Run(fmt.Sprintf("linked=%t", linked), func(t *testing.T) {
			h, pool, _ := securityDB(t)
			user, _, _ := seedReset(t, h)
			if linked {
				if _, err := pool.Exec(context.Background(), `UPDATE users SET google_id='google-original' WHERE id=$1`, user.ID); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := pool.Exec(context.Background(), `UPDATE users SET is_active=false WHERE id=$1`, user.ID); err != nil {
				t.Fatal(err)
			}
			profile := googleProfile{Subject: "google-original", Email: user.Email, EmailVerified: true}
			if _, err := h.findOrCreateGoogleUser(httptest.NewRequest("GET", "/", nil), profile, "user"); err == nil {
				t.Fatal("disabled Google login succeeded")
			}
			// The SQL itself protects the read/update race, not only the Go guard.
			if _, err := h.Queries.LinkGoogleIdentity(context.Background(), db.LinkGoogleIdentityParams{ID: user.ID, GoogleID: pgtype.Text{String: profile.Subject, Valid: true}}); err == nil {
				t.Fatal("link query reactivated a disabled account")
			}
			current, err := h.Queries.GetUserByID(context.Background(), user.ID)
			if err != nil || current.IsActive.Bool {
				t.Fatal("disabled state changed", err)
			}
			if _, err := pool.Exec(context.Background(), `UPDATE users SET is_active=true WHERE id=$1`, user.ID); err != nil {
				t.Fatal(err)
			}
			active, err := h.findOrCreateGoogleUser(httptest.NewRequest("GET", "/", nil), profile, "user")
			if err != nil || !active.IsActive.Bool {
				t.Fatal("valid Google sign-in failed", err)
			}
			profile.Subject = "google-other"
			if _, err := h.findOrCreateGoogleUser(httptest.NewRequest("GET", "/", nil), profile, "user"); err == nil {
				t.Fatal("replaced an existing Google identity by email")
			}
		})
	}
}
