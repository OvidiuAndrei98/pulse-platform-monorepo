package tickets

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
)

// Run only against an isolated, fully migrated local database. All fixtures
// are rolled back; this test makes no Stripe or invoice-provider requests.
func TestTicketAmountsAndVATSnapshotIntegration(t *testing.T) {
	dsn := os.Getenv("TICKET_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TICKET_TEST_DATABASE_URL to a migrated local spottr_ticket_test database")
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
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := tx.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	id := func(sql string, args ...any) pgtype.UUID {
		t.Helper()
		var value pgtype.UUID
		if err := tx.QueryRow(ctx, sql, args...).Scan(&value); err != nil {
			t.Fatal(err)
		}
		return value
	}
	owner := id(`INSERT INTO users(username,email,password_hash,role,is_active) VALUES('ticket-owner','ticket-owner@example.invalid','unused','organizer',true) RETURNING id`)
	other := id(`INSERT INTO users(username,email,password_hash,role,is_active) VALUES('ticket-other','ticket-other@example.invalid','unused','user',true) RETURNING id`)
	event := id(`INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status) VALUES($1,'Ticket test','house','Venue','Bucuresti','social',44,26,now()+interval '1 day',now()+interval '2 days','place','published') RETURNING id`, owner)
	exec(`INSERT INTO organizer_profiles(user_id,cui,company_name,fiscal_address) VALUES($1,'TICKET-TEST','Test company','Test address')`, owner)
	exec(`INSERT INTO organizer_invoicing_settings(organizer_id,provider,account_email,credentials_encrypted,company_vat_code,series_name,vat_name,vat_percentage) VALUES($1,'oblio','test@example.invalid','unused','TEST','TEST','Original',21)`, owner)
	queries := db.New(tx)
	exec(`UPDATE events SET vat_percentage=21 WHERE id=$1`, event)
	order, err := queries.CreateCheckoutOrder(ctx, db.CreateCheckoutOrderParams{UserID: owner, EventID: event, Email: "buyer@example.invalid", TotalAmount: 30, CustomerTicketingFeeBani: 101, Status: db.OrderStatusCompleted, BillingType: "individual", BillingCountry: "Romania"})
	if err != nil {
		t.Fatal(err)
	}
	rate, _ := order.TicketVatPercentage.Float64Value()
	if !rate.Valid || rate.Float64 != 21 || order.TicketVatName.String != "Original" {
		t.Fatal("checkout did not snapshot VAT")
	}
	typeID := id(`INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales) VALUES($1,'General',10,100,now(),now()+interval '1 day') RETURNING id`, event)
	exec(`INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES($1,$2,3,10)`, order.ID, typeID)
	var ticketIDs []pgtype.UUID
	for i := 0; i < 3; i++ {
		ticketIDs = append(ticketIDs, id(`INSERT INTO tickets(order_id,ticket_type_id,user_id,validation_hash) VALUES($1,$2,$3,$4) RETURNING id`, order.ID, typeID, owner, fmt.Sprintf("ticket-fixture-%d", i)))
	}
	// Today's ticket price and VAT must not change any historical amount.
	exec(`UPDATE events SET vat_percentage=11 WHERE id=$1`, event)
	exec(`UPDATE ticket_types SET price_ron=999 WHERE id=$1`, typeID)
	exec(`UPDATE organizer_invoicing_settings SET vat_percentage=9,vat_name='Changed' WHERE organizer_id=$1`, owner)
	rows, err := queries.GetUserTickets(ctx, owner)
	if err != nil || len(rows) != 3 {
		t.Fatalf("get tickets: count=%d err=%v", len(rows), err)
	}
	var price, fee int64
	allocations := map[pgtype.UUID]int64{}
	for _, row := range rows {
		price += row.TicketPriceBani
		fee += row.TicketFeeBani
		allocations[row.ID] = row.TicketFeeBani
		if row.UnitPriceRon != 10 || row.TicketPriceBani != 1000 || row.TicketFeeBani < 33 || row.TicketFeeBani > 34 {
			t.Fatalf("wrong historical allocation: %+v", row)
		}
		vat, _ := row.TicketVatPercentage.Float64Value()
		if !vat.Valid || vat.Float64 != 21 {
			t.Fatal("VAT changed with organizer settings")
		}
	}
	if price != 3000 || fee != 101 {
		t.Fatalf("rounding loses money: price=%d fee=%d", price, fee)
	}
	// A claimed/transferred ticket keeps its allocation even when the viewer
	// does not own every ticket in the order.
	exec(`UPDATE tickets SET user_id=$1 WHERE id=$2`, other, ticketIDs[0])
	otherRows, err := queries.GetUserTickets(ctx, other)
	if err != nil || len(otherRows) != 1 || otherRows[0].TicketFeeBani != allocations[ticketIDs[0]] {
		t.Fatalf("ownership changed allocation: %v %+v", err, otherRows)
	}
	invoice := id(`INSERT INTO billing_invoices(order_id,organizer_id,provider) VALUES($1,$2,'oblio') RETURNING id`, order.ID, owner)
	billing, err := queries.GetBillingInvoiceIssueData(ctx, invoice)
	if err != nil {
		t.Fatal(err)
	}
	billingRate, _ := billing.VatPercentage.Float64Value()
	if billingRate.Float64 != 21 || billing.VatName != "Original" {
		t.Fatal("invoice must use the checkout VAT snapshot")
	}
	var changed pgtype.Numeric
	_ = changed.Scan("9")
	if err := queries.SnapshotOrderInvoiceVAT(ctx, db.SnapshotOrderInvoiceVATParams{OrderID: order.ID, VatPercentage: changed, VatName: "Changed"}); err != nil {
		t.Fatal(err)
	}
	billing, err = queries.GetBillingInvoiceIssueData(ctx, invoice)
	if err != nil || billing.VatName != "Original" {
		t.Fatal("snapshot overwritten on retry")
	}
	// Mixed-price orders allocate recorded fees proportionally, including the
	// last cent. Changing today's prices still cannot alter the allocation.
	exec(`UPDATE tickets SET user_id=$1 WHERE order_id=$2`, owner, order.ID)
	vipType := id(`INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales) VALUES($1,'VIP',888,100,now(),now()+interval '1 day') RETURNING id`, event)
	exec(`UPDATE tickets SET ticket_type_id=$1 WHERE id=$2`, vipType, ticketIDs[0])
	exec(`UPDATE order_items SET quantity=2 WHERE order_id=$1`, order.ID)
	exec(`INSERT INTO order_items(order_id,ticket_type_id,quantity,unit_price_ron) VALUES($1,$2,1,20)`, order.ID, vipType)
	exec(`UPDATE orders SET total_amount=40,customer_ticketing_fee_bani=103 WHERE id=$1`, order.ID)
	rows, err = queries.GetUserTickets(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	price, fee = 0, 0
	for _, row := range rows {
		price += row.TicketPriceBani
		fee += row.TicketFeeBani
		if row.TicketPriceBani != int64(row.UnitPriceRon)*100 {
			t.Fatal("mixed prices lost their recorded amounts")
		}
		if row.TicketFeeBani < int64(row.UnitPriceRon)*103/40 || row.TicketFeeBani > int64(row.UnitPriceRon)*103/40+1 {
			t.Fatal("fee was not allocated proportionally")
		}
	}
	if price != 4000 || fee != 103 {
		t.Fatal("mixed-price allocation lost money")
	}
	// Zero-price tickets and organizer-covered fees must remain exactly zero.
	exec(`UPDATE orders SET total_amount=0,customer_ticketing_fee_bani=0,ticket_vat_percentage=NULL,ticket_vat_name=NULL WHERE id=$1`, order.ID)
	exec(`UPDATE order_items SET unit_price_ron=0 WHERE order_id=$1`, order.ID)
	rows, err = queries.GetUserTickets(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if row.TicketPriceBani != 0 || row.TicketFeeBani != 0 || MapUserTicket(row).VatAmountBani != nil {
			t.Fatal("zero/unknown amounts were invented")
		}
	}
}
