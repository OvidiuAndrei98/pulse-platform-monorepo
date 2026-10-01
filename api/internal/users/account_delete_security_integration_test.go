package users

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func randomTestID(t *testing.T) string {
	t.Helper()
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		t.Fatal(err)
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(value)
	return fmt.Sprintf("%s-%s-%s-%s-%s", encoded[:8], encoded[8:12], encoded[12:16], encoded[16:20], encoded[20:])
}

func accountDeleteDB(t *testing.T) (*Handler, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("USER_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set USER_TEST_DATABASE_URL to a local spottr_security_test database")
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
	schema := "user_delete_test_" + strings.ReplaceAll(randomTestID(t), "-", "")[:20]
	identifier := pgx.Identifier{schema}.Sanitize()
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+identifier); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, cleanupErr := admin.Exec(context.Background(), "DROP SCHEMA "+identifier+" CASCADE"); cleanupErr != nil {
			t.Error(cleanupErr)
		}
		admin.Close()
	})

	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	cfg.ConnConfig.RuntimeParams["application_name"] = schema
	cfg.ConnConfig.RuntimeParams["statement_timeout"] = "15000"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	_, err = pool.Exec(ctx, `
		CREATE TABLE users (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			email text NOT NULL UNIQUE,
			role text,
			avatar_url text,
			password_hash text
		);
		CREATE TABLE orders (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id uuid REFERENCES users(id) ON DELETE SET NULL,
			email text NOT NULL,
			status text NOT NULL DEFAULT 'completed',
			account_owner_deleted_at timestamptz
		);
		CREATE TABLE tickets (
			id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
			user_id uuid REFERENCES users(id) ON DELETE SET NULL,
			validation_hash text NOT NULL UNIQUE
		);
		CREATE TABLE user_billing_details (
			user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			address text NOT NULL
		);
		CREATE TABLE user_media_deletion_jobs (
			object_key text PRIMARY KEY,
			attempts integer NOT NULL DEFAULT 0,
			next_attempt_at timestamptz NOT NULL DEFAULT now(),
			last_error text,
			created_at timestamptz NOT NULL DEFAULT now()
		);`)
	if err != nil {
		t.Fatal(err)
	}
	return NewHandler(db.New(pool), pool), pool
}

func performDeleteAccountRequest(handler http.HandlerFunc, userID, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodDelete, "/users/me", strings.NewReader(body))
	request = request.WithContext(context.WithValue(request.Context(), auth.UserIDKey, userID))
	response := httptest.NewRecorder()
	handler(response, request)
	return response
}

func performRecentDeleteAccountRequest(handler http.HandlerFunc, userID, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodDelete, "/users/me", strings.NewReader(body))
	ctx := context.WithValue(request.Context(), auth.UserIDKey, userID)
	ctx = context.WithValue(ctx, auth.IssuedAtKey, time.Now())
	request = request.WithContext(ctx)
	response := httptest.NewRecorder()
	handler(response, request)
	return response
}

func TestDeleteAccountRemovesProfileTicketsAndRetainsDetachedOrder(t *testing.T) {
	handler, pool := accountDeleteDB(t)
	ctx := context.Background()
	userID := randomTestID(t)
	orderID := randomTestID(t)
	passwordHash, err := auth.HashPassword("current-password")
	if err != nil {
		t.Fatal(err)
	}
	avatarURL := "https://api.example.com/api/v1/media/avatars/" + userID + "/0123456789abcdef0123456789abcdef.jpg"
	_, err = pool.Exec(ctx, `INSERT INTO users (id, email, role, password_hash, avatar_url) VALUES ($1, 'person@example.com', 'user', $2, $3)`, userID, passwordHash, avatarURL)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `INSERT INTO orders (id, user_id, email) VALUES ($1, $2, 'person@example.com')`, orderID, userID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `INSERT INTO tickets (order_id, user_id, validation_hash) VALUES ($1, $2, 'secret-ticket')`, orderID, userID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `INSERT INTO user_billing_details (user_id, address) VALUES ($1, 'Private address')`, userID)
	if err != nil {
		t.Fatal(err)
	}

	response := performDeleteAccountRequest(handler.HandleDeleteMe, userID, `{"confirmation":"PERSON@example.com","currentPassword":"current-password"}`)
	if response.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d, body = %s", response.Code, response.Body.String())
	}

	for table, want := range map[string]int{"users": 0, "tickets": 0, "user_billing_details": 0, "orders": 1, "user_media_deletion_jobs": 1} {
		var count int
		if err = pool.QueryRow(ctx, fmt.Sprintf("SELECT COUNT(*) FROM %s", table)).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != want {
			t.Fatalf("%s count = %d, want %d", table, count, want)
		}
	}
	var detached, deletionMarked bool
	if err = pool.QueryRow(ctx, `SELECT user_id IS NULL, account_owner_deleted_at IS NOT NULL FROM orders WHERE id = $1`, orderID).Scan(&detached, &deletionMarked); err != nil {
		t.Fatal(err)
	}
	if !detached {
		t.Fatal("retained order must be detached from deleted account")
	}
	if !deletionMarked {
		t.Fatal("retained order must not be reclaimable or fulfilled after account deletion")
	}

	recreatedUserID := randomTestID(t)
	if _, err = pool.Exec(ctx, `INSERT INTO users (id, email, role, password_hash) VALUES ($1, 'person@example.com', 'user', $2)`, recreatedUserID, passwordHash); err != nil {
		t.Fatal(err)
	}
	var recreatedUUID pgtype.UUID
	if err = recreatedUUID.Scan(recreatedUserID); err != nil {
		t.Fatal(err)
	}
	if err = db.New(pool).AssignGuestOrdersToUser(ctx, recreatedUUID); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `SELECT user_id IS NULL FROM orders WHERE id = $1`, orderID).Scan(&detached); err != nil {
		t.Fatal(err)
	}
	if !detached {
		t.Fatal("a recreated account must not reclaim retained history from a deleted account")
	}
}

func TestDeleteAccountRequiresExactEmailAndBlocksPrivilegedRoles(t *testing.T) {
	handler, pool := accountDeleteDB(t)
	ctx := context.Background()
	userID := randomTestID(t)
	organizerID := randomTestID(t)
	legacyNullRoleID := randomTestID(t)
	passwordHash, err := auth.HashPassword("current-password")
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `INSERT INTO users (id, email, role, password_hash) VALUES
		($1::uuid, 'person@example.com', 'user', $4),
		($2::uuid, 'organizer@example.com', 'organizer', $4),
		($3::uuid, 'legacy@example.com', NULL, $4)`, userID, organizerID, legacyNullRoleID, passwordHash)
	if err != nil {
		t.Fatal(err)
	}

	wrongEmail := performDeleteAccountRequest(handler.HandleDeleteMe, userID, `{"confirmation":"other@example.com"}`)
	if wrongEmail.Code != http.StatusBadRequest {
		t.Fatalf("wrong-email status = %d, body = %s", wrongEmail.Code, wrongEmail.Body.String())
	}
	wrongPassword := performDeleteAccountRequest(handler.HandleDeleteMe, userID, `{"confirmation":"person@example.com","currentPassword":"wrong"}`)
	if wrongPassword.Code != http.StatusUnauthorized {
		t.Fatalf("wrong-password status = %d, body = %s", wrongPassword.Code, wrongPassword.Body.String())
	}
	blockedRole := performDeleteAccountRequest(handler.HandleDeleteMe, organizerID, `{"confirmation":"organizer@example.com"}`)
	if blockedRole.Code != http.StatusConflict {
		t.Fatalf("organizer status = %d, body = %s", blockedRole.Code, blockedRole.Body.String())
	}
	blockedNullRole := performDeleteAccountRequest(handler.HandleDeleteMe, legacyNullRoleID, `{"confirmation":"legacy@example.com","currentPassword":"current-password"}`)
	if blockedNullRole.Code != http.StatusConflict {
		t.Fatalf("null-role status = %d, body = %s", blockedNullRole.Code, blockedNullRole.Body.String())
	}

	var count int
	if err = pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatalf("blocked deletion changed users: count = %d", count)
	}
}

func TestDeleteGoogleAccountRequiresRecentAuthentication(t *testing.T) {
	handler, pool := accountDeleteDB(t)
	ctx := context.Background()
	userID := randomTestID(t)
	if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, role) VALUES ($1, 'google@example.com', 'user')`, userID); err != nil {
		t.Fatal(err)
	}

	stale := performDeleteAccountRequest(handler.HandleDeleteMe, userID, `{"confirmation":"google@example.com"}`)
	if stale.Code != http.StatusUnauthorized {
		t.Fatalf("stale Google session status = %d, body = %s", stale.Code, stale.Body.String())
	}
	recent := performRecentDeleteAccountRequest(handler.HandleDeleteMe, userID, `{"confirmation":"google@example.com"}`)
	if recent.Code != http.StatusNoContent {
		t.Fatalf("recent Google session status = %d, body = %s", recent.Code, recent.Body.String())
	}
}
