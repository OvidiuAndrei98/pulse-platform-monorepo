package notifications

import (
	"context"
	"fmt"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http/httptest"
	"os"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"strings"
	"testing"
	"time"
)

func TestPermanentGroupNotificationAuthorizationAndRetiredPush(t *testing.T) {
	dsn := os.Getenv("ISOLATION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("local migrated isolation database required")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil || cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated database")
	}
	ctx := context.Background()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var owner, friend, group string
	tag := time.Now().UnixNano()
	for i, target := range []*string{&owner, &friend} {
		if err = pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'test','user',TRUE) RETURNING id::text`, fmt.Sprintf("group-push-%d-%d", tag, i), fmt.Sprintf("group-push-%d-%d@example.invalid", tag, i)).Scan(target); err != nil {
			t.Fatal(err)
		}
	}
	if err = pool.QueryRow(ctx, `INSERT INTO friend_groups(owner_id,created_by,name,request_id,request_fingerprint) VALUES($1,$1,'private',gen_random_uuid(),'test') RETURNING id::text`, owner).Scan(&group); err != nil {
		t.Fatal(err)
	}
	defer func() {
		for _, sql := range []string{`DELETE FROM notifications WHERE friend_group_id=$1`, `DELETE FROM friend_group_members WHERE group_id=$1`, `DELETE FROM friend_groups WHERE id=$1`} {
			if _, e := pool.Exec(ctx, sql, group); e != nil {
				t.Error(e)
			}
		}
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id IN($1::uuid,$2::uuid)`, owner, friend)
	}()
	if _, err = pool.Exec(ctx, `INSERT INTO friend_group_members(group_id,user_id,status,invited_by,joined_at) VALUES($1,$2,'accepted',$2,clock_timestamp()),($1,$3,'pending',$2,NULL)`, group, owner, friend); err != nil {
		t.Fatal(err)
	}
	if _, err = pool.Exec(ctx, `INSERT INTO notification_push_devices(user_id,expo_token,revoke_hash,platform,language) VALUES($1,$2,$3,'ios','en')`, friend, fmt.Sprintf("ExpoPushToken[group-test-%d]", tag), strings.Repeat("a", 64)); err != nil {
		t.Fatal(err)
	}
	notice := func(kind string) string {
		t.Helper()
		var id string
		if e := pool.QueryRow(ctx, `INSERT INTO notifications(user_id,type,title,body,friend_group_id) VALUES($1,$2,'private','opaque',$3) RETURNING id::text`, friend, kind, group).Scan(&id); e != nil {
			t.Fatal(e)
		}
		return id
	}
	invite := notice("friend_group_invite")
	notice("friend_group_outing")
	retired := notice("safety_help")
	queries := db.New(pool)
	// Only the invitation is visible before membership acceptance, even if an
	// outdated writer queued a regular/private notification or retired alert.
	var friendID pgtype.UUID
	if err = friendID.Scan(friend); err != nil {
		t.Fatal(err)
	}
	items, err := queries.ListNotifications(ctx, db.ListNotificationsParams{UserID: friendID, Limit: 100})
	if err != nil || len(items) != 1 || items[0].Type != "friend_group_invite" {
		t.Fatalf("pending visibility: %d %v", len(items), err)
	}
	unread, err := queries.CountUnreadNotifications(ctx, friendID)
	if err != nil || unread != 1 {
		t.Fatal("unread includesinaccessible notification", unread, err)
	}
	service := &PushService{Pool: pool}
	jobs, err := service.claim(ctx, "queued")
	if err != nil {
		t.Fatal(err)
	}
	for _, job := range jobs {
		if job.UserID == friend && job.Valid != (job.ID == invite) {
			t.Fatal("pending/retiredpushauthorization")
		}
	}
	request := httptest.NewRequest("GET", "/notification", nil)
	route := chi.NewRouteContext()
	route.URLParams.Add("id", retired)
	request = request.WithContext(context.WithValue(context.WithValue(request.Context(), auth.UserIDKey, friend), chi.RouteCtxKey, route))
	w := httptest.NewRecorder()
	service.HandleNotification(w, request)
	if w.Code != 404 {
		t.Fatal("retireddeeplinknotification stillreads")
	}
	if _, err = pool.Exec(ctx, `UPDATE friend_group_members SET status='accepted',joined_at=clock_timestamp() WHERE group_id=$1 AND user_id=$2`, group, friend); err != nil {
		t.Fatal(err)
	}
	active := notice("friend_group_chosen")
	if _, err = pool.Exec(ctx, `UPDATE friend_group_members SET muted=TRUE WHERE group_id=$1 AND user_id=$2`, group, friend); err != nil {
		t.Fatal(err)
	}
	jobs, err = service.claim(ctx, "queued")
	if err != nil {
		t.Fatal(err)
	}
	for _, job := range jobs {
		if job.ID == active && job.Valid {
			t.Fatal("queuedpushignoredmute")
		}
	}
	if _, err = pool.Exec(ctx, `UPDATE friend_group_members SET status='removed' WHERE group_id=$1 AND user_id=$2`, group, friend); err != nil {
		t.Fatal(err)
	}
	items, err = queries.ListNotifications(ctx, db.ListNotificationsParams{UserID: friendID, Limit: 100})
	if err != nil || len(items) != 0 {
		t.Fatal("removedmember notificationsleak", err)
	}
}
