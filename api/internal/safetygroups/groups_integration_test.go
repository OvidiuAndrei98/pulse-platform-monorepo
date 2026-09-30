package safetygroups

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type safetyFixture struct {
	ownerID, friendID, outsiderID  pgtype.UUID
	eventID, ticketTypeID, groupID pgtype.UUID
	ownerOrderID, friendOrderID    pgtype.UUID
}

func safetyTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("ISOLATION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set ISOLATION_TEST_DATABASE_URL to a migrated local spottr_security_test database")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal("invalid safety test database config")
	}
	if cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated test database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	var tableExists bool
	if err := pool.QueryRow(context.Background(), `SELECT to_regclass('event_safety_groups') IS NOT NULL`).Scan(&tableExists); err != nil {
		pool.Close()
		t.Fatalf("cannot connect to the configured safety test database: %v", err)
	}
	if !tableExists {
		pool.Close()
		t.Fatal("safety-group migration is not applied to spottr_security_test")
	}
	t.Cleanup(pool.Close)
	return pool
}

func seedSafetyFixture(t *testing.T, pool *pgxpool.Pool) safetyFixture {
	t.Helper()
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	var fixture safetyFixture
	for index, target := range []*pgtype.UUID{&fixture.ownerID, &fixture.friendID, &fixture.outsiderID} {
		if err := pool.QueryRow(ctx, `
			INSERT INTO users(username,email,password_hash,role,is_active)
			VALUES($1,$2,'not-used','user',TRUE) RETURNING id`,
			fmt.Sprintf("safety-%d-%d", suffix, index), fmt.Sprintf("safety-%d-%d@example.invalid", suffix, index)).Scan(target); err != nil {
			t.Fatal(err)
		}
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status)
		VALUES($1,'Safety integration','house','Venue','Bucuresti','social',44,26,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '2 hours',$2,'published')
		RETURNING id`, fixture.ownerID, fmt.Sprintf("safety-place-%d", suffix)).Scan(&fixture.eventID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO ticket_types(event_id,name,price_ron,capacity,tickets_sold,start_sales,end_sales)
		VALUES($1,'General',50,10,2,clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day') RETURNING id`, fixture.eventID).Scan(&fixture.ticketTypeID); err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct {
		userID  pgtype.UUID
		orderID *pgtype.UUID
		hash    string
	}{{fixture.ownerID, &fixture.ownerOrderID, fmt.Sprintf("owner-%d", suffix)}, {fixture.friendID, &fixture.friendOrderID, fmt.Sprintf("friend-%d", suffix)}} {
		if err := pool.QueryRow(ctx, `
			INSERT INTO orders(user_id,event_id,email,status,total_amount)
			VALUES($1,$2,$3,'completed',50) RETURNING id`, item.userID, fixture.eventID, item.hash+"@example.invalid").Scan(item.orderID); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `
			INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash,is_validated,validated_at)
			VALUES($1,$2,$3,$4,TRUE,CURRENT_TIMESTAMP)`, *item.orderID, fixture.ticketTypeID, item.userID, item.hash); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted')`, fixture.ownerID, fixture.friendID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO event_safety_groups(event_id,owner_id,expires_at)
		SELECT $1,$2,end_time + interval '24 hours' FROM events WHERE id=$1 RETURNING id`, fixture.eventID, fixture.ownerID).Scan(&fixture.groupID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO event_safety_group_members(group_id,event_id,user_id,status,invited_by,responded_at)
		VALUES($1,$2,$3,'accepted',$3,CURRENT_TIMESTAMP),($1,$2,$4,'pending',$3,NULL)`, fixture.groupID, fixture.eventID, fixture.ownerID, fixture.friendID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO event_safety_messages(group_id,event_id,sender_id,kind,content,expires_at)
		SELECT $1,$2,$3,'message','private',$4 FROM event_safety_groups WHERE id=$1`, fixture.groupID, fixture.eventID, fixture.ownerID, time.Now().Add(25*time.Hour)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM notifications WHERE event_id=$1`, fixture.eventID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM event_safety_groups WHERE id=$1`, fixture.groupID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM orders WHERE id IN ($1,$2)`, fixture.ownerOrderID, fixture.friendOrderID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM ticket_types WHERE id=$1`, fixture.ticketTypeID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM events WHERE id=$1`, fixture.eventID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id IN ($1,$2,$3)`, fixture.ownerID, fixture.friendID, fixture.outsiderID)
	})
	return fixture
}

func safetyRequest(method, path string, body any, userID, eventID pgtype.UUID) *http.Request {
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(payload))
	ctx := context.WithValue(request.Context(), auth.UserIDKey, common.UUIDToString(userID))
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("id", common.UUIDToString(eventID))
	return request.WithContext(context.WithValue(ctx, chi.RouteCtxKey, routeContext))
}

func TestPendingMemberCannotReadMessagesAndOutsiderHasNoGroup(t *testing.T) {
	pool := safetyTestPool(t)
	fixture := seedSafetyFixture(t, pool)
	handler := NewHandler(pool, nil)

	for _, test := range []struct {
		userID       pgtype.UUID
		wantGroup    bool
		wantMessages int
	}{{fixture.friendID, true, 0}, {fixture.outsiderID, false, 0}} {
		response := httptest.NewRecorder()
		handler.HandleGet(response, safetyRequest(http.MethodGet, "/", nil, test.userID, fixture.eventID))
		if response.Code != http.StatusOK {
			t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
		}
		var envelope envelopeResponse
		if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
			t.Fatal(err)
		}
		if (envelope.Group != nil) != test.wantGroup {
			t.Fatalf("group presence=%v want=%v", envelope.Group != nil, test.wantGroup)
		}
		if envelope.Group != nil && len(envelope.Group.Messages) != test.wantMessages {
			t.Fatalf("pending member received %d private messages", len(envelope.Group.Messages))
		}
	}
}

func TestRefundRevokesGroupAndSafetyNotificationAccess(t *testing.T) {
	pool := safetyTestPool(t)
	fixture := seedSafetyFixture(t, pool)
	if _, err := pool.Exec(context.Background(), `
		UPDATE event_safety_group_members SET status='accepted',responded_at=CURRENT_TIMESTAMP
		WHERE group_id=$1 AND user_id=$2`, fixture.groupID, fixture.friendID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `
		INSERT INTO notifications(user_id,type,title,body,event_id,actor_id,expires_at)
		VALUES($1,'safety_help','Help','private alert',$2,$3,CURRENT_TIMESTAMP+interval '1 day')`, fixture.friendID, fixture.eventID, fixture.ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), `UPDATE orders SET status='refunded' WHERE id=$1`, fixture.friendOrderID); err != nil {
		t.Fatal(err)
	}

	response := httptest.NewRecorder()
	NewHandler(pool, nil).HandleGet(response, safetyRequest(http.MethodGet, "/", nil, fixture.friendID, fixture.eventID))
	var envelope envelopeResponse
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Group != nil {
		t.Fatal("refunded member retained group access")
	}
	items, err := db.New(pool).ListNotifications(context.Background(), db.ListNotificationsParams{UserID: fixture.friendID, Limit: 30})
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatal("refunded member retained safety notification access")
	}
}

func TestConcurrentHelpIsAtomic(t *testing.T) {
	pool := safetyTestPool(t)
	fixture := seedSafetyFixture(t, pool)
	if _, err := pool.Exec(context.Background(), `UPDATE event_safety_group_members SET status='accepted',responded_at=CURRENT_TIMESTAMP WHERE group_id=$1 AND user_id=$2`, fixture.groupID, fixture.friendID); err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(pool, nil)
	var wait sync.WaitGroup
	statuses := make(chan int, 10)
	for range 10 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			response := httptest.NewRecorder()
			handler.HandleHelp(response, safetyRequest(http.MethodPost, "/", messageRequest{Content: "help"}, fixture.ownerID, fixture.eventID))
			statuses <- response.Code
		}()
	}
	wait.Wait()
	close(statuses)
	successes := 0
	for status := range statuses {
		if status == http.StatusCreated {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent help successes=%d want=1", successes)
	}
	var messages, notifications int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM event_safety_messages WHERE group_id=$1 AND kind='help'`, fixture.groupID).Scan(&messages); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM notifications WHERE event_id=$1 AND type='safety_help'`, fixture.eventID).Scan(&notifications); err != nil {
		t.Fatal(err)
	}
	if messages != 1 || notifications != 1 {
		t.Fatalf("messages=%d notifications=%d want 1/1", messages, notifications)
	}
}

func TestHelpWithoutEligibleRecipientRollsBackMessage(t *testing.T) {
	pool := safetyTestPool(t)
	fixture := seedSafetyFixture(t, pool)
	if _, err := pool.Exec(context.Background(), `DELETE FROM event_safety_group_members WHERE group_id=$1 AND user_id=$2`, fixture.groupID, fixture.friendID); err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	NewHandler(pool, nil).HandleHelp(response, safetyRequest(http.MethodPost, "/", messageRequest{Content: "help"}, fixture.ownerID, fixture.eventID))
	if response.Code != http.StatusConflict {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
	var count int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM event_safety_messages WHERE group_id=$1 AND kind='help'`, fixture.groupID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("help message committed without any eligible recipient")
	}
}

func TestOneMembershipPerEventUnderConcurrency(t *testing.T) {
	pool := safetyTestPool(t)
	fixture := seedSafetyFixture(t, pool)
	var secondGroup pgtype.UUID
	if err := pool.QueryRow(context.Background(), `
		INSERT INTO event_safety_groups(event_id,owner_id,expires_at)
		SELECT $1,$2,end_time + interval '24 hours' FROM events WHERE id=$1 RETURNING id`, fixture.eventID, fixture.friendID).Scan(&secondGroup); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM event_safety_groups WHERE id=$1`, secondGroup)
	})

	groups := []pgtype.UUID{fixture.groupID, secondGroup}
	var wait sync.WaitGroup
	results := make(chan bool, 2)
	for _, groupID := range groups {
		wait.Add(1)
		go func(groupID pgtype.UUID) {
			defer wait.Done()
			_, err := pool.Exec(context.Background(), `
				INSERT INTO event_safety_group_members(group_id,event_id,user_id,status,invited_by)
				VALUES($1,$2,$3,'pending',$4)`, groupID, fixture.eventID, fixture.outsiderID, fixture.ownerID)
			results <- err == nil
		}(groupID)
	}
	wait.Wait()
	close(results)
	successes := 0
	for success := range results {
		if success {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("membership insert successes=%d want=1", successes)
	}
}

func TestCleanupReconcilesEditedEndTimeThenDeletesExpiredGroup(t *testing.T) {
	pool := safetyTestPool(t)
	fixture := seedSafetyFixture(t, pool)
	handler := NewHandler(pool, nil)
	newEnd := time.Now().UTC().Add(72 * time.Hour).Truncate(time.Second)
	if _, err := pool.Exec(context.Background(), `UPDATE events SET end_time=$2 WHERE id=$1`, fixture.eventID, newEnd); err != nil {
		t.Fatal(err)
	}
	runCleanup := func() {
		ctx, cancel := context.WithCancel(context.Background())
		handler.StartCleanupWorker(ctx)
		t.Cleanup(cancel)
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			var expiry time.Time
			err := pool.QueryRow(context.Background(), `SELECT expires_at FROM event_safety_groups WHERE id=$1`, fixture.groupID).Scan(&expiry)
			if err == nil && expiry.UTC().Truncate(time.Second).Equal(newEnd.Add(24*time.Hour)) {
				cancel()
				return
			}
			time.Sleep(25 * time.Millisecond)
		}
		cancel()
		t.Fatal("cleanup worker did not reconcile the edited event end time")
	}
	runCleanup()

	if _, err := pool.Exec(context.Background(), `UPDATE events SET end_time=CURRENT_TIMESTAMP-interval '25 hours' WHERE id=$1`, fixture.eventID); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	handler.StartCleanupWorker(ctx)
	defer cancel()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		var exists bool
		if err := pool.QueryRow(context.Background(), `SELECT EXISTS(SELECT 1 FROM event_safety_groups WHERE id=$1)`, fixture.groupID).Scan(&exists); err != nil {
			t.Fatal(err)
		}
		if !exists {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatal("cleanup worker did not physically delete the expired group")
}
