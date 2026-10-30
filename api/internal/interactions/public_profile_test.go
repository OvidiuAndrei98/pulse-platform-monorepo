package interactions

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

type publicProfileTestRow []any

func (row publicProfileTestRow) Scan(dest ...any) error {
	for index, value := range row {
		reflect.ValueOf(dest[index]).Elem().Set(reflect.ValueOf(value))
	}
	return nil
}

type publicProfileTestDB struct {
	t       *testing.T
	profile db.GetPublicProfileRow
	writes  int
}

func (store *publicProfileTestDB) QueryRow(_ context.Context, query string, _ ...any) pgx.Row {
	switch {
	case strings.HasPrefix(query, "-- name: GetPublicProfile "):
		p := store.profile
		return publicProfileTestRow{p.ID, p.Username, p.AvatarUrl, p.Bio, p.Role, p.OrganizerName, p.OrganizerVerified}
	case strings.HasPrefix(query, "-- name: GetFriendshipRelationship "):
		return publicProfileTestRow{"none"}
	case strings.HasPrefix(query, "-- name: GetOrganizerFollowState "):
		return publicProfileTestRow{true}
	case strings.HasPrefix(query, "-- name: GetOrganizerFollowerCount "):
		return publicProfileTestRow{int64(7)}
	case strings.HasPrefix(query, "-- name: GetOrganizerPublicStats "):
		return publicProfileTestRow{int64(3), int64(42)}
	default:
		store.t.Fatalf("unexpected public profile query: %.80s", query)
		return nil
	}
}

func (store *publicProfileTestDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	store.t.Fatal("unexpected list query")
	return nil, nil
}

func (store *publicProfileTestDB) Exec(_ context.Context, query string, _ ...any) (pgconn.CommandTag, error) {
	if !strings.HasPrefix(query, "-- name: FollowOrganizer ") {
		store.t.Fatalf("unexpected profile mutation: %.80s", query)
	}
	store.writes++
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func publicProfileFixture(t *testing.T, role, name string, verified bool) *publicProfileTestDB {
	t.Helper()
	var id pgtype.UUID
	if err := id.Scan("00000000-0000-4000-8000-000000000001"); err != nil {
		t.Fatal(err)
	}
	return &publicProfileTestDB{t: t, profile: db.GetPublicProfileRow{
		ID: id, Username: "Profile fixture", Role: pgtype.Text{String: role, Valid: true},
		OrganizerName: name, OrganizerVerified: verified,
	}}
}

func publicProfileRequest(param string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/profiles/fixture", nil)
	route := chi.NewRouteContext()
	route.URLParams.Add(param, "00000000-0000-4000-8000-000000000001")
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, auth.UserIDKey, "00000000-0000-4000-8000-000000000002")
	ctx = context.WithValue(ctx, auth.RoleKey, "admin")
	return r.WithContext(ctx)
}

func TestPublicProfileRetainsOrganizerIdentityAndStatisticsForAdmin(t *testing.T) {
	for _, test := range []struct {
		name, role, company, wantRole string
		verified                      bool
	}{
		{"organizer", "organizer", "", "organizer", false},
		{"admin organizer", "admin", "Fixture Company", "organizer", true},
		{"pending admin organizer", "admin", "Fixture Company", "organizer", false},
		{"legacy verified admin", "admin", "", "organizer", true},
		{"ordinary admin", "admin", "", "admin", false},
		{"blank company", "admin", "   ", "admin", false},
		{"demoted organizer", "user", "Old Company", "user", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			store := publicProfileFixture(t, test.role, test.company, test.verified)
			r, response := publicProfileRequest("id"), httptest.NewRecorder()
			NewHandler(db.New(store)).HandleGetPublicProfile(response, r)
			if response.Code != http.StatusOK {
				t.Fatalf("profile returned %d: %s", response.Code, response.Body.String())
			}
			var profile PublicProfileResponse
			if err := json.Unmarshal(response.Body.Bytes(), &profile); err != nil {
				t.Fatal(err)
			}
			if profile.Role != test.wantRole {
				t.Fatalf("public role = %q, want %q", profile.Role, test.wantRole)
			}
			if test.wantRole == "organizer" {
				if profile.FollowerCount != 7 || profile.EventCount != 3 || profile.TicketsSoldCount != 42 || !profile.FollowsOrganizer {
					t.Fatalf("organizer data was omitted: %+v", profile)
				}
			} else if profile.FollowerCount != 0 || profile.EventCount != 0 || profile.TicketsSoldCount != 0 || profile.FollowsOrganizer {
				t.Fatalf("ordinary account acquired organizer statistics: %+v", profile)
			}
			if store.profile.Role.String != test.role || r.Context().Value(auth.RoleKey) != "admin" {
				t.Fatal("public presentation changed the account's authorization role")
			}
		})
	}
}

func TestFollowAcceptsAdminOrganizersAndRejectsOrdinaryAccounts(t *testing.T) {
	for _, test := range []struct {
		role, company string
		wantStatus    int
	}{
		{"organizer", "Fixture Company", http.StatusOK},
		{"admin", "Fixture Company", http.StatusOK},
		{"admin", "", http.StatusNotFound},
		{"user", "Old Company", http.StatusNotFound},
	} {
		t.Run(test.role+"/"+test.company, func(t *testing.T) {
			store := publicProfileFixture(t, test.role, test.company, false)
			response := httptest.NewRecorder()
			NewHandler(db.New(store)).HandleFollowOrganizer(response, publicProfileRequest("userId"))
			if response.Code != test.wantStatus {
				t.Fatalf("follow returned %d, want %d: %s", response.Code, test.wantStatus, response.Body.String())
			}
			if (store.writes == 1) != (test.wantStatus == http.StatusOK) {
				t.Fatalf("unexpected follow writes: %d", store.writes)
			}
		})
	}
}
