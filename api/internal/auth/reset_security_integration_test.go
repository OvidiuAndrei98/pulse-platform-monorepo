package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "pulse-api/db/generated"
)

// Explicit opt-in, localhost-only throwaway database. Never reads DATABASE_URL.
// Each test owns a unique schema, including its fault-injection triggers.
func securityDB(t *testing.T) (*Handler, *pgxpool.Pool, string) {
	t.Helper()
	dsn := os.Getenv("AUTH_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set AUTH_TEST_DATABASE_URL to a local spottr_security_test database")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal("invalid test database config")
	}
	if cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated test database")
	}
	ctx := context.Background()
	admin, err := pgxpool.NewWithConfig(ctx, cfg.Copy())
	if err != nil {
		t.Fatal(err)
	}
	_, schema, err := GenerateSecureToken()
	if err != nil {
		t.Fatal(err)
	}
	schema = "auth_test_" + schema[:24]
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, err := admin.Exec(context.Background(), "DROP SCHEMA "+identifier+" CASCADE")
		if err != nil {
			t.Error(err)
		}
		admin.Close()
	})
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	cfg.ConnConfig.RuntimeParams["application_name"] = schema
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "15000"
	cfg.MaxConns = 8
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	// Minimal schema mirrors the production auth columns; generated production
	// queries and real handlers are exercised, no mocked transaction behavior.
	_, err = pool.Exec(ctx, `CREATE TABLE users (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE,
	email text NOT NULL UNIQUE, password_hash text, avatar_url text, role text,
	bio text, created_at timestamptz DEFAULT now(), is_active boolean,
	google_id text, preferred_language text NOT NULL DEFAULT 'ro',
	show_attendance_publicly boolean NOT NULL DEFAULT true);
	CREATE TABLE user_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES users(id), token_hash varchar(64) NOT NULL UNIQUE,
	type text NOT NULL CHECK (type IN ('activation','password_reset')),
	expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now());`)
	if err != nil {
		t.Fatal(err)
	}
	return NewHandler(db.New(pool), pool, nil), pool, schema
}

func seedReset(t *testing.T, h *Handler) (db.Users, string, string) {
	t.Helper()
	hash, err := HashPassword("original-password")
	if err != nil {
		t.Fatal(err)
	}
	u, err := h.Queries.CreateUser(context.Background(), db.CreateUserParams{Username: "test-user", Email: "test@example.invalid", PasswordHash: pgtype.Text{String: hash, Valid: true}, Role: pgtype.Text{String: "user", Valid: true}, IsActive: pgtype.Bool{Bool: true, Valid: true}})
	if err != nil {
		t.Fatal(err)
	}
	return u, addResetToken(t, h, u.ID, "password_reset", time.Now().Add(time.Hour)), addResetToken(t, h, u.ID, "password_reset", time.Now().Add(time.Hour))
}

func addResetToken(t *testing.T, h *Handler, id pgtype.UUID, kind string, expires time.Time) string {
	t.Helper()
	plain, hash, err := GenerateSecureToken()
	if err != nil {
		t.Fatal(err)
	}
	_, err = h.Queries.InsertUserToken(context.Background(), db.InsertUserTokenParams{UserID: id, TokenHash: hash, Type: kind, ExpiresAt: pgtype.Timestamptz{Time: expires, Valid: true}})
	if err != nil {
		t.Fatal(err)
	}
	return plain
}

func authRequest(handler http.HandlerFunc, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/", strings.NewReader(body))
	handler(w, r)
	return w
}

func resetRequest(h *Handler, token string) *httptest.ResponseRecorder {
	body, _ := json.Marshal(ResetPasswordRequest{Token: token, NewPassword: "new-secure-password"})
	return authRequest(h.ResetPassword, string(body))
}

func countReset(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var count int
	if err := pool.QueryRow(context.Background(), "SELECT count(*) FROM user_tokens WHERE type='password_reset'").Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}

func TestSecurityResetConsumesAllTokens(t *testing.T) {
	h, pool, _ := securityDB(t)
	u, first, second := seedReset(t, h)
	activation := addResetToken(t, h, u.ID, "activation", time.Now().Add(time.Hour))
	if w := resetRequest(h, first); w.Code != 200 {
		t.Fatalf("reset: %d %s", w.Code, w.Body.String())
	}
	if countReset(t, pool) != 0 {
		t.Fatal("sibling tokens survived")
	}
	for _, token := range []string{first, second, activation, "invalid"} {
		if w := resetRequest(h, token); w.Code != 401 {
			t.Fatalf("replay/wrong token accepted: %d", w.Code)
		}
	}
	updated, err := h.Queries.GetUserByID(context.Background(), u.ID)
	if err != nil || !CheckPasswordHash("new-secure-password", updated.PasswordHash.String) {
		t.Fatal("password not changed", err)
	}
	if _, err = h.Queries.GetUserTokenByHash(context.Background(), db.GetUserTokenByHashParams{TokenHash: HashPlainToken(activation), Type: "activation"}); err != nil {
		t.Fatal("activation invalidated", err)
	}
}

func waitForUserLocks(t *testing.T, pool *pgxpool.Pool, schema string, count int) {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		var waiting int
		err := pool.QueryRow(context.Background(), `SELECT count(*) FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND query LIKE '%LockUserForPasswordReset%'`, schema).Scan(&waiting)
		if err != nil {
			t.Fatal(err)
		}
		if waiting >= count {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("requests did not reach concurrent user-row lock")
}

func TestSecurityConcurrentResetSingleWinner(t *testing.T) {
	for _, same := range []bool{true, false} {
		t.Run(fmt.Sprintf("same_token_%t", same), func(t *testing.T) {
			h, pool, schema := securityDB(t)
			u, first, second := seedReset(t, h)
			if same {
				second = first
			}
			lock, err := pool.Begin(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			defer lock.Rollback(context.Background())
			if _, err = h.Queries.WithTx(lock).LockUserForPasswordReset(context.Background(), u.ID); err != nil {
				t.Fatal(err)
			}
			results := make(chan int, 2)
			go func() { results <- resetRequest(h, first).Code }()
			go func() { results <- resetRequest(h, second).Code }()
			waitForUserLocks(t, pool, schema, 2)
			if err = lock.Commit(context.Background()); err != nil {
				t.Fatal(err)
			}
			a, b := <-results, <-results
			if !((a == 200 && b == 401) || (a == 401 && b == 200)) {
				t.Fatalf("expected one winner, got %d / %d", a, b)
			}
			if countReset(t, pool) != 0 {
				t.Fatal("tokens remain")
			}
		})
	}
}

func TestSecurityResetRollback(t *testing.T) {
	h, pool, _ := securityDB(t)
	u, first, _ := seedReset(t, h)
	_, err := pool.Exec(context.Background(), `CREATE FUNCTION fail_token_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
	CREATE TRIGGER fail_delete BEFORE DELETE ON user_tokens FOR EACH ROW EXECUTE FUNCTION fail_token_delete();`)
	if err != nil {
		t.Fatal(err)
	}
	if w := resetRequest(h, first); w.Code != 500 {
		t.Fatalf("fault not propagated: %d", w.Code)
	}
	updated, err := h.Queries.GetUserByID(context.Background(), u.ID)
	if err != nil || updated.PasswordHash.String != u.PasswordHash.String || countReset(t, pool) != 2 {
		t.Fatal("partial reset committed", err)
	}
	if _, err = pool.Exec(context.Background(), "DROP TRIGGER fail_delete ON user_tokens"); err != nil {
		t.Fatal(err)
	}
	if w := resetRequest(h, first); w.Code != 200 {
		t.Fatal("rolled back token unusable")
	}
}

func TestSecurityResetExpiryAfterLock(t *testing.T) {
	h, pool, schema := securityDB(t)
	u, first, _ := seedReset(t, h)
	lock, err := pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Rollback(context.Background())
	if _, err = h.Queries.WithTx(lock).LockUserForPasswordReset(context.Background(), u.ID); err != nil {
		t.Fatal(err)
	}
	result := make(chan int, 1)
	go func() { result <- resetRequest(h, first).Code }()
	waitForUserLocks(t, pool, schema, 1)
	// Set expiry after the reset transaction's start, then cross it while locked.
	if _, err = pool.Exec(context.Background(), "UPDATE user_tokens SET expires_at=clock_timestamp() WHERE token_hash=$1", HashPlainToken(first)); err != nil {
		t.Fatal(err)
	}
	if err = lock.Commit(context.Background()); err != nil {
		t.Fatal(err)
	}
	if status := <-result; status != 401 {
		t.Fatalf("expired during wait accepted: %d", status)
	}
	if w := resetRequest(h, first); w.Code != 401 {
		t.Fatal("already expired token accepted")
	}
	updated, err := h.Queries.GetUserByID(context.Background(), u.ID)
	if err != nil || updated.PasswordHash.String != u.PasswordHash.String {
		t.Fatal("expired token changed password", err)
	}
}

type resetEmail struct {
	token        string
	contextError error
}
type resetEmailCapture struct {
	release  chan struct{}
	messages chan resetEmail
}

func (m *resetEmailCapture) SendActivationEmail(context.Context, string, string) error { return nil }
func (m *resetEmailCapture) SendPasswordResetEmail(ctx context.Context, email, token string) error {
	<-m.release
	m.messages <- resetEmail{token, ctx.Err()}
	return nil
}

func TestSecurityForgotResponseAndDetachedEmail(t *testing.T) {
	h, pool, _ := securityDB(t)
	_, _, _ = seedReset(t, h)
	m := &resetEmailCapture{release: make(chan struct{}), messages: make(chan resetEmail, 1)}
	h.EmailSender = m
	ctx, cancel := context.WithCancel(context.Background())
	r := httptest.NewRequest("POST", "/", strings.NewReader(`{"email":"test@example.invalid"}`)).WithContext(ctx)
	w := httptest.NewRecorder()
	h.ForgotPassword(w, r)
	cancel()
	close(m.release)
	var mail resetEmail
	select {
	case mail = <-m.messages:
	case <-time.After(3 * time.Second):
		t.Fatal("missing reset email")
	}
	if mail.contextError != nil || len(mail.token) != 64 {
		t.Fatal("email context cancelled or missing token")
	}
	unknown := authRequest(h.ForgotPassword, `{"email":"missing@example.invalid"}`)
	if w.Code != 200 || unknown.Code != 200 || w.Body.String() != unknown.Body.String() {
		t.Fatal("responses disclose account existence")
	}
	var payload map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload) != 1 || payload["message"] == nil || strings.Contains(w.Body.String(), mail.token) {
		t.Fatal("response leaks reset credentials")
	}
	if _, err := h.Queries.GetUserTokenByHash(context.Background(), db.GetUserTokenByHashParams{TokenHash: HashPlainToken(mail.token), Type: "password_reset"}); err != nil {
		t.Fatal("emailed token not persisted", err)
	}
	h.EmailSender = nil
	if _, err := pool.Exec(context.Background(), "ALTER TABLE user_tokens ADD CONSTRAINT reject_reset CHECK (type <> 'password_reset') NOT VALID"); err != nil {
		t.Fatal(err)
	}
	failed := authRequest(h.ForgotPassword, `{"email":"test@example.invalid"}`)
	if failed.Code != 200 || failed.Body.String() != unknown.Body.String() {
		t.Fatal("persistence failure leaked")
	}
}

func TestSecurityForgotSerializesWithReset(t *testing.T) {
	h, pool, schema := securityDB(t)
	u, _, _ := seedReset(t, h)
	lock, err := pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Rollback(context.Background())
	qtx := h.Queries.WithTx(lock)
	if _, err = qtx.LockUserForPasswordReset(context.Background(), u.ID); err != nil {
		t.Fatal(err)
	}
	result := make(chan int, 1)
	go func() { result <- authRequest(h.ForgotPassword, `{"email":"test@example.invalid"}`).Code }()
	waitForUserLocks(t, pool, schema, 1)
	if countReset(t, pool) != 2 {
		t.Fatal("issuer wrote without user lock")
	}
	if err = qtx.DeleteUserPasswordResetTokens(context.Background(), u.ID); err != nil {
		t.Fatal(err)
	}
	if err = lock.Commit(context.Background()); err != nil {
		t.Fatal(err)
	}
	if status := <-result; status != 200 || countReset(t, pool) != 1 {
		t.Fatal("post-reset request not serialized")
	}
}

func TestSecurityRegisterCannotAssignAdmin(t *testing.T) {
	h, _, _ := securityDB(t)
	w := authRequest(h.HandleRegister, `{"username":"ordinary","email":"ordinary@example.invalid","password":"secure-password","role":"admin","is_active":true,"password_hash":"injected","google_id":"injected"}`)
	if w.Code != 201 {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	u, err := h.Queries.GetUserByEmail(context.Background(), "ordinary@example.invalid")
	if err != nil || u.Role.String != "user" || u.IsActive.Bool || u.GoogleID.Valid || !CheckPasswordHash("secure-password", u.PasswordHash.String) {
		t.Fatal("privileged mass assignment", err)
	}
}
