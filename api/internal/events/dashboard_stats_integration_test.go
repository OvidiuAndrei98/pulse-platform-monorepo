package events

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
)

func TestDashboardTicketStatsCountIssuedSalesAndEarlyScans(t *testing.T) {
	pool := isolationTestPool(t)
	f := seedOwnershipFixture(t, pool)
	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	queries := db.New(tx)

	assertCounts := func(sold, scanned int64) {
		t.Helper()
		row, err := queries.GetEventWithStats(ctx, f.eventID)
		if err != nil {
			t.Fatal(err)
		}
		rows, err := queries.ListEventsWithStats(ctx, f.ownerID)
		if err != nil {
			t.Fatal(err)
		}
		if len(rows) != 1 {
			t.Fatalf("expected one owned event, got %d", len(rows))
		}
		for _, response := range []EventResponse{MapFromDBGetEventWithStats(row), MapFromDBListEventsWithStats(rows[0])} {
			if response.Stats.TotalTicketsSold == nil || *response.Stats.TotalTicketsSold != sold || response.Stats.TotalTicketsScanned == nil || *response.Stats.TotalTicketsScanned != scanned {
				t.Fatalf("wanted %d sold/%d scanned, got %+v", sold, scanned, response.Stats)
			}
		}
	}
	assertCounts(0, 0)
	// Reservations affect stock, but must not become dashboard sales.
	if _, err := tx.Exec(ctx, "UPDATE ticket_types SET tickets_sold=20 WHERE id=$1", f.ticketID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "UPDATE events SET status='published',start_time=now()+interval '30 minutes' WHERE id=$1", f.eventID); err != nil {
		t.Fatal(err)
	}
	seedOrder := func(eventID, ticketType pgtype.UUID, status string, quantity, scanned, price int, guest bool) {
		t.Helper()
		var order pgtype.UUID
		var buyer any = f.ownerID
		if guest {
			buyer = nil
		}
		if err := tx.QueryRow(ctx, `INSERT INTO orders(user_id,event_id,email,status,total_amount) VALUES($1,$2,'dashboard@example.invalid',$3::order_status,$4) RETURNING id`, buyer, eventID, status, quantity*price).Scan(&order); err != nil {
			t.Fatal(err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES($1,$2,$3,$4)`, order, ticketType, quantity, price); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < quantity; i++ {
			if _, err := tx.Exec(ctx, `INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash,is_validated,validated_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $5 THEN now() ELSE NULL END)`, order, ticketType, buyer, fmt.Sprintf("%s-%d", order.String(), i), i < scanned); err != nil {
				t.Fatal(err)
			}
		}
	}
	seedOrder(f.eventID, f.ticketID, "completed", 2, 1, 50, false)
	seedOrder(f.eventID, f.ticketID, "completed", 1, 1, 0, true)
	// Even a stray ticket on an unfinished/refunded order must not inflate totals.
	for _, status := range []string{"pending", "failed", "refunded"} {
		seedOrder(f.eventID, f.ticketID, status, 1, 1, 50, false)
	}
	seedOrder(f.otherEventID, f.otherTicketID, "completed", 1, 1, 50, false)
	assertCounts(3, 2)
	// Revalidating the same ticket changes no totals; the unit is tickets, not attempts.
	if _, err := tx.Exec(ctx, "UPDATE tickets SET validated_at=now() WHERE ticket_type_id=$1 AND is_validated=TRUE", f.ticketID); err != nil {
		t.Fatal(err)
	}
	assertCounts(3, 2)
}

func TestDashboardScanCountersAreNotExposedInPublicEventResponses(t *testing.T) {
	for _, response := range []EventResponse{MapFromDBGetEvent(db.GetEventByIDRow{}), MapFromDBListEvents(db.ListEventsRow{})} {
		payload, err := json.Marshal(response)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(payload), "totalTicketsSold") || strings.Contains(string(payload), "totalTicketsScanned") {
			t.Fatal("private ticket statistics leaked in a public event response")
		}
	}
}
