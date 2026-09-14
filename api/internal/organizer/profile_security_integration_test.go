package organizer

import (
	"context"
	"fmt"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func organizerIsolationPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("ISOLATION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set ISOLATION_TEST_DATABASE_URL to a migrated local spottr_security_test database")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal("invalid isolation test database config")
	}
	if cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated test database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func organizerProfileRequest(handler *Handler, viewerID, role string, targetID pgtype.UUID) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", "/dashboard/organizer/profile/"+targetID.String(), nil)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("id", targetID.String())
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, routeContext)
	if viewerID != "" {
		ctx = context.WithValue(ctx, auth.UserIDKey, viewerID)
		ctx = context.WithValue(ctx, auth.RoleKey, role)
	}
	w := httptest.NewRecorder()
	handler.HandleGetOrganizerProfile(w, r.WithContext(ctx))
	return w
}

func TestOrganizerPrivateProfileIsSelfOrAdminOnly(t *testing.T) {
	pool := organizerIsolationPool(t)
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	shortSuffix := suffix[len(suffix)-10:]
	ids := make([]pgtype.UUID, 3)
	roles := []string{"organizer", "organizer", "admin"}
	for index := range ids {
		if err := pool.QueryRow(context.Background(), `INSERT INTO users (username,email,password_hash,role,is_active) VALUES ($1,$2,'not-used',$3,TRUE) RETURNING id`, fmt.Sprintf("profile-security-%d-%s", index, suffix), fmt.Sprintf("profile-security-%d-%s@example.invalid", index, suffix), roles[index]).Scan(&ids[index]); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), "DELETE FROM users WHERE id=$1 OR id=$2 OR id=$3", ids[0], ids[1], ids[2]); err != nil {
			t.Error(err)
		}
	})
	if _, err := pool.Exec(context.Background(), `INSERT INTO organizer_profiles (user_id,cui,company_name,fiscal_address,is_verified,verification_status,stripe_account_id,organizer_agreement_version) VALUES ($1,$2,'Private Company','Private address',TRUE,'approved',$3,'private-contract')`, ids[0], "PROFILE"+shortSuffix, "acct_private_"+shortSuffix); err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(db.New(pool))

	if response := organizerProfileRequest(handler, ids[0].String(), "organizer", ids[0]); response.Code != 200 {
		t.Fatalf("owner denied: %d %s", response.Code, response.Body.String())
	}
	if response := organizerProfileRequest(handler, ids[2].String(), "admin", ids[0]); response.Code != 200 {
		t.Fatalf("admin denied: %d %s", response.Code, response.Body.String())
	}
	if response := organizerProfileRequest(handler, ids[1].String(), "organizer", ids[0]); response.Code != 403 {
		t.Fatalf("foreign organizer received private profile: %d %s", response.Code, response.Body.String())
	}
	if response := organizerProfileRequest(handler, "", "", ids[0]); response.Code != 401 {
		t.Fatalf("missing identity was not rejected: %d", response.Code)
	}
}

func TestOrganizerPrivateProfileDenialOccursBeforeDatabaseRead(t *testing.T) {
	var target pgtype.UUID
	if err := target.Scan("ea79b1ed-99b1-4000-a000-000000000001"); err != nil {
		t.Fatal(err)
	}
	// A nil query layer would panic if authorization happened after the read.
	handler := NewHandler(nil)
	if response := organizerProfileRequest(handler, "ea79b1ed-99b1-4000-a000-000000000002", "organizer", target); response.Code != 403 {
		t.Fatalf("foreign request reached data layer: %d", response.Code)
	}
}
