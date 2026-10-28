package tickets

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
)

func TestUserTicketsExposeExactCompletedOrderWithoutOtherPurchases(t *testing.T) {
	dsn := os.Getenv("TICKET_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires a migrated local spottr_ticket_test database")
	}
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Host != "127.0.0.1" || cfg.Database != "spottr_ticket_test" {
		t.Fatal("refusing non-isolated database")
	}
	ctx := context.Background()
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	id := func(query string, args ...any) string {
		t.Helper()
		var value string
		if err := tx.QueryRow(ctx, query, args...).Scan(&value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	user := func(name string) string {
		return id(`INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'unused','user',true) RETURNING id::text`, name, name+"@example.invalid")
	}
	buyer, other := user("ticket-order-buyer"), user("ticket-order-other")
	event := id(`INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status)
 VALUES($1,'Order identity','house','Venue','Bucuresti','social',44,26,now()+interval '1 day',now()+interval '2 days','order-qa','published') RETURNING id::text`, other)
	tier := id(`INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales) VALUES($1,'General',50,100,now(),now()+interval '1 day') RETURNING id::text`, event)
	want := map[string]string{}
	for index, row := range []struct {
		owner, status string
		quantity      int
	}{
		{buyer, "completed", 2}, // Existing tickets for the very same event.
		{buyer, "completed", 1}, // The newly completed checkout must stay distinct.
		{buyer, "pending", 1},
		{buyer, "failed", 1},
		{buyer, "refunded", 1},
		{other, "completed", 1},
	} {
		order := id(`INSERT INTO orders(user_id,event_id,email,status,total_amount) VALUES($1,$2,'buyer@example.invalid',$3::order_status,$4) RETURNING id::text`, row.owner, event, row.status, row.quantity*50)
		if _, err := tx.Exec(ctx, `INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES($1,$2,$3,50)`, order, tier, row.quantity); err != nil {
			t.Fatal(err)
		}
		for i := range row.quantity {
			ticket := id(`INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash) VALUES($1,$2,$3,$4) RETURNING id::text`, order, tier, row.owner, fmt.Sprintf("order-identity-%d-%d", index, i))
			if row.owner == buyer && row.status == "completed" {
				want[ticket] = order
			}
		}
	}
	handler := NewHandler(db.New(tx), nil, "https://example.invalid")
	request := httptest.NewRequest(http.MethodGet, "/users/me/tickets", nil)
	request = request.WithContext(context.WithValue(ctx, auth.UserIDKey, buyer))
	w := httptest.NewRecorder()
	handler.HandleGetUserTickets(w, request)
	if w.Code != http.StatusOK {
		t.Fatalf("get user tickets: %d %s", w.Code, w.Body.String())
	}
	var tickets []UserTicketResponse
	if err := json.Unmarshal(w.Body.Bytes(), &tickets); err != nil {
		t.Fatal(err)
	}
	if len(tickets) != len(want) {
		t.Fatalf("unpaid, refunded or foreign tickets leaked: got %d want %d", len(tickets), len(want))
	}
	ordersSeen := map[string]int{}
	for _, ticket := range tickets {
		if want[ticket.ID] == "" || ticket.OrderID != want[ticket.ID] || ticket.EventID != event {
			t.Fatalf("ticket lost its exact order: id=%s order=%s event=%s", ticket.ID, ticket.OrderID, ticket.EventID)
		}
		ordersSeen[ticket.OrderID]++
		delete(want, ticket.ID)
	}
	if len(want) != 0 || len(ordersSeen) != 2 {
		t.Fatal("same-event purchases were combined or duplicated")
	}
}
