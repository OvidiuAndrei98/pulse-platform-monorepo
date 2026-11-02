package interactions

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
)

const requestRecipient = "00000000-0000-4000-8000-000000000001"
const requestSender = "00000000-0000-4000-8000-000000000002"
const requestNotice = "00000000-0000-4000-8000-000000000003"

type friendResponseStore struct {
	t                                *testing.T
	available                        bool
	failed                           bool
	declines, accepts, notifications int
	scoped                           bool
}

func (s *friendResponseStore) QueryRow(_ context.Context, query string, args ...any) pgx.Row {
	s.t.Helper()
	if !strings.HasPrefix(query, "-- name: DeclineFriendRequest ") {
		s.t.Fatalf("unexpected query: %.80s", query)
	}
	s.declines++
	// Assert the actual SQL bindings, including the former sender/recipient reversal.
	if common.UUIDToString(args[0].(pgtype.UUID)) != requestRecipient || common.UUIDToString(args[1].(pgtype.UUID)) != requestSender {
		s.t.Fatal("decline used reversed request ownership")
	}
	notice := args[2].(pgtype.UUID)
	if notice.Valid != s.scoped || (notice.Valid && common.UUIDToString(notice) != requestNotice) {
		s.t.Fatal("decline lost its notification identity")
	}
	if s.failed {
		return friendResponseErrorRow{}
	}
	ids := []pgtype.UUID{}
	if s.available {
		var id pgtype.UUID
		_ = id.Scan(requestNotice)
		ids = append(ids, id)
	}
	return publicProfileTestRow{s.available, ids}
}

type friendResponseErrorRow struct{}

func (friendResponseErrorRow) Scan(...any) error { return errors.New("test database unavailable") }
func (s *friendResponseStore) Query(context.Context, string, ...any) (pgx.Rows, error) {
	s.t.Fatal("unexpected list query")
	return nil, nil
}
func (s *friendResponseStore) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	if strings.HasPrefix(query, "-- name: AcceptFriendRequest ") {
		s.accepts++
		if common.UUIDToString(args[0].(pgtype.UUID)) != requestSender || common.UUIDToString(args[1].(pgtype.UUID)) != requestRecipient {
			s.t.Fatal("only the incoming request recipient can accept")
		}
		return pgconn.NewCommandTag("UPDATE 1"), nil
	}
	if strings.HasPrefix(query, "-- name: CreateNotification ") {
		s.notifications++
		if common.UUIDToString(args[0].(pgtype.UUID)) != requestSender || args[1] != "friend_accepted" || common.UUIDToString(args[5].(pgtype.UUID)) != requestRecipient {
			s.t.Fatal("acceptance notification has wrong ownership")
		}
		return pgconn.NewCommandTag("INSERT 0 1"), nil
	}
	s.t.Fatalf("unexpected write: %.80s", query)
	return pgconn.CommandTag{}, nil
}

func runFriendResponse(t *testing.T, store *friendResponseStore, body string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodPut, "/friends/request/"+requestSender, strings.NewReader(body))
	route := chi.NewRouteContext()
	route.URLParams.Add("userId", requestSender)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, route)
	ctx = context.WithValue(ctx, auth.UserIDKey, requestRecipient)
	w := httptest.NewRecorder()
	NewHandler(db.New(store)).HandleRespondToFriendRequest(w, r.WithContext(ctx))
	return w
}

func TestDecliningFriendRequestUsesRecipientSenderAndExactNotification(t *testing.T) {
	for _, scoped := range []bool{true, false} {
		s := &friendResponseStore{t: t, available: true, scoped: scoped}
		body := `{"status":"declined"}`
		if scoped {
			body = `{"status":"declined","notificationId":"` + requestNotice + `"}`
		}
		w := runFriendResponse(t, s, body)
		if w.Code != http.StatusOK {
			t.Fatalf("decline: %d %s", w.Code, w.Body.String())
		}
		var response struct {
			Relationship string   `json:"relationship"`
			Removed      []string `json:"removedNotificationIds"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if response.Relationship != "none" || len(response.Removed) != 1 || response.Removed[0] != requestNotice || s.accepts != 0 || s.notifications != 0 {
			t.Fatalf("unexpected decline: %s", w.Body.String())
		}
	}
}

func TestDecliningStaleOrUnownedRequestNeverReportsSuccessfulDeletion(t *testing.T) {
	for _, failed := range []bool{true, false} {
		s := &friendResponseStore{t: t, failed: failed, scoped: true}
		w := runFriendResponse(t, s, `{"status":"declined","notificationId":"`+requestNotice+`"}`)
		expected := http.StatusNotFound
		if failed {
			expected = http.StatusInternalServerError
		}
		if w.Code != expected || s.notifications != 0 {
			t.Fatalf("got %d, want %d", w.Code, expected)
		}
	}
}

func TestAcceptingFriendRequestRetainsItsOriginalNotification(t *testing.T) {
	s := &friendResponseStore{t: t, available: true}
	w := runFriendResponse(t, s, `{"status":"accepted","notificationId":"`+requestNotice+`"}`)
	if w.Code != 200 || s.declines != 0 || s.accepts != 1 || s.notifications != 1 || !strings.Contains(w.Body.String(), `"removedNotificationIds":[]`) {
		t.Fatalf("accept: %d %s", w.Code, w.Body.String())
	}
}

func TestInvalidFriendResponseCannotReachDatabase(t *testing.T) {
	for _, body := range []string{`{"status":"declined","notificationId":"bad"}`, `{"status":"unknown"}`, `{`} {
		s := &friendResponseStore{t: t}
		w := runFriendResponse(t, s, body)
		if w.Code != 400 || s.declines+s.accepts+s.notifications != 0 {
			t.Fatalf("invalid response: %d %s", w.Code, w.Body.String())
		}
	}
}
