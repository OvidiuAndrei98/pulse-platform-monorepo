package events

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
)

func feedRequest(h *Handler, method, path, event, actor string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, nil)
	ctx := r.Context()
	if actor != "" {
		ctx = context.WithValue(ctx, auth.UserIDKey, actor)
	}
	route := chi.NewRouteContext()
	route.URLParams.Add("id", event)
	ctx = context.WithValue(ctx, chi.RouteCtxKey, route)
	w := httptest.NewRecorder()
	if path == "/event-feed" || strings.HasPrefix(path, "/event-feed?") {
		h.HandleEventFeed(w, r.WithContext(ctx))
	} else if method == "GET" {
		h.HandleEventLikes(w, r.WithContext(ctx))
	} else {
		h.HandleSetEventLike(w, r.WithContext(ctx))
	}
	return w
}
func TestEventFeedPublicScopeAndLikeLifecycle(t *testing.T) {
	pool := isolationTestPool(t)
	f := seedOwnershipFixture(t, pool)
	ctx := context.Background()
	h := NewHandler(db.New(pool), pool)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	read := func(actor string) eventLikeResponse {
		t.Helper()
		w := feedRequest(h, "GET", "/likes", f.eventID.String(), actor)
		if w.Code != 200 {
			t.Fatalf("like read %d: %s", w.Code, w.Body)
		}
		var result eventLikeResponse
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	if w := feedRequest(h, "GET", "/likes", f.eventID.String(), ""); w.Code != 404 {
		t.Fatal("draft exposed", w.Code)
	}
	exec("UPDATE events SET status='published',start_time=now()-interval '1 hour',end_time=now()+interval '1 hour' WHERE id=$1", f.eventID)
	if w := feedRequest(h, "PUT", "/likes", f.eventID.String(), ""); w.Code != 401 {
		t.Fatal("anonymous write", w.Code)
	}
	var wg sync.WaitGroup
	codes := make(chan int, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- feedRequest(h, "PUT", "/likes", f.eventID.String(), f.otherOwnerID.String()).Code
		}()
	}
	wg.Wait()
	close(codes)
	for code := range codes {
		if code != 200 {
			t.Fatalf("concurrent like %d", code)
		}
	}
	if result := read(""); result.Liked || result.LikeCount != 1 {
		t.Fatalf("public state %+v", result)
	}
	if result := read(f.otherOwnerID.String()); !result.Liked || result.LikeCount != 1 {
		t.Fatalf("owner state %+v", result)
	}
	if result := read(f.ownerID.String()); result.Liked {
		t.Fatal("like leaked across accounts")
	}
	exec("UPDATE users SET is_active=FALSE WHERE id=$1", f.otherOwnerID)
	if read("").LikeCount != 0 {
		t.Fatal("inactive user counted")
	}
	for _, method := range []string{"GET", "PUT", "DELETE"} {
		if w := feedRequest(h, method, "/likes", f.eventID.String(), f.otherOwnerID.String()); w.Code != 401 {
			t.Fatalf("inactive %s %d", method, w.Code)
		}
	}
	exec("UPDATE users SET is_active=TRUE WHERE id=$1", f.otherOwnerID)
	for i := 0; i < 2; i++ {
		if w := feedRequest(h, "DELETE", "/likes", f.eventID.String(), f.otherOwnerID.String()); w.Code != 200 {
			t.Fatal(w.Code, w.Body)
		}
	}
	if read("").LikeCount != 0 {
		t.Fatal("unlike failed")
	}
	w := feedRequest(h, "GET", "/event-feed", "", "")
	if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("feed %d %s", w.Code, w.Body)
	}
	if !strings.Contains(w.Body.String(), f.eventID.String()) || strings.Contains(w.Body.String(), f.otherEventID.String()) {
		t.Fatal("public feed scope", w.Body)
	}
	for _, secret := range []string{"email", "validationHash", "userId", "stripe", "password"} {
		if strings.Contains(w.Body.String(), `"`+secret+`"`) {
			t.Fatal("private field in feed", secret)
		}
	}
	exec("INSERT INTO user_hidden_event_categories(user_id,category) VALUES($1,'HOUSE')", f.otherOwnerID)
	if w := feedRequest(h, "GET", "/event-feed", "", f.otherOwnerID.String()); strings.Contains(w.Body.String(), f.eventID.String()) {
		t.Fatal("hidden category ignored")
	}
	for _, page := range []string{"0", "501", "no", "-1"} {
		if w := feedRequest(h, "GET", "/event-feed?page="+page, "", ""); w.Code != 400 {
			t.Fatal("invalid page", page, w.Code)
		}
	}
	for _, status := range []string{"cancelled", "draft"} {
		exec("UPDATE events SET status=$1 WHERE id=$2", status, f.eventID)
		if w := feedRequest(h, "PUT", "/likes", f.eventID.String(), f.otherOwnerID.String()); w.Code != 404 {
			t.Fatal("unpublished like", status, w.Code)
		}
	}
	exec("UPDATE events SET status='published',end_time=now()-interval '1 minute',start_time=now()-interval '2 hours' WHERE id=$1", f.eventID)
	if w := feedRequest(h, "GET", "/likes", f.eventID.String(), ""); w.Code != 404 {
		t.Fatal("ended event", w.Code)
	}
	if w := feedRequest(h, "GET", "/likes", "broken", ""); w.Code != 400 {
		t.Fatal("invalid event id", w.Code)
	}
}

func TestFriendsFeedRespectsVisibilityFriendshipEventAndRefunds(t *testing.T) {
	pool := isolationTestPool(t)
	f := seedOwnershipFixture(t, pool)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := tx.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec("UPDATE events SET status='published' WHERE id=$1", f.eventID)
	exec("UPDATE users SET show_attendance_publicly=TRUE WHERE id=$1", f.otherOwnerID)
	exec("INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted')", f.ownerID, f.otherOwnerID)
	exec("INSERT INTO event_rsvps(user_id,event_id,status) VALUES($1,$2,'going')", f.otherOwnerID, f.eventID)
	queries := db.New(tx)
	assertRows := func(want int, kind string) {
		t.Helper()
		rows, err := queries.ListSocialFeed(ctx, f.ownerID)
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) != want || len(rows) > 0 && rows[0].ActivityType != kind {
			t.Fatalf("wanted %d %s; got %+v", want, kind, rows)
		}
	}
	assertRows(1, "friend_going")
	for _, sql := range []string{"UPDATE users SET show_attendance_publicly=FALSE WHERE id=$1", "UPDATE users SET is_active=FALSE WHERE id=$1"} {
		exec(sql, f.otherOwnerID)
		assertRows(0, "")
		exec("UPDATE users SET is_active=TRUE,show_attendance_publicly=TRUE WHERE id=$1", f.otherOwnerID)
	}
	exec("UPDATE friendships SET status='pending' WHERE user_id=$1", f.ownerID)
	assertRows(0, "")
	exec("UPDATE friendships SET status='accepted' WHERE user_id=$1", f.ownerID)
	exec("UPDATE events SET status='draft' WHERE id=$1", f.eventID)
	assertRows(0, "")
	exec("UPDATE events SET status='published' WHERE id=$1", f.eventID)
	var order pgtype.UUID
	if err := tx.QueryRow(ctx, `INSERT INTO orders(user_id,event_id,email,status,total_amount) VALUES($1,$2,'feed@example.invalid','completed',50) RETURNING id`, f.otherOwnerID, f.eventID).Scan(&order); err != nil {
		t.Fatal(err)
	}
	exec("INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash) VALUES($1,$2,$3,$4)", order, f.ticketID, f.otherOwnerID, "feed-"+order.String())
	assertRows(1, "friend_ticket")
	exec("UPDATE orders SET stripe_refund_status='partial',stripe_amount_refunded_bani=100 WHERE id=$1", order)
	assertRows(1, "friend_going")
	exec("DELETE FROM event_rsvps WHERE user_id=$1 AND event_id=$2", f.otherOwnerID, f.eventID)
	assertRows(0, "")
}
