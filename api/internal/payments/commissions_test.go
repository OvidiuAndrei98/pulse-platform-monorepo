package payments

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
	"testing"
)

func TestCommissionRounding(t *testing.T) {
	for _, c := range []struct {
		total              int64
		count, rate, fixed int32
		want               int64
	}{
		{10000, 1, 500, 150, 650}, {100, 1, 225, 0, 3}, {9900, 3, 225, 125, 598}, {5000, 1, 0, 0, 0}, {5000, 1, 0, 200, 200},
	} {
		if got := calculateCommissionBani(c.total, c.count, c.rate, c.fixed); got != c.want {
			t.Fatalf("%+v got %d", c, got)
		}
	}
}

func TestStandardCommissionCheckoutAndStaleQuotes(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	ctx := context.Background()
	q := db.New(pool)
	standard, err := q.GetStandardCommission(ctx)
	if err != nil || standard.RateBps != 500 || standard.PerTicketBani != 150 {
		t.Fatalf("migrated standard must be 5%% + 1.50 RON: %+v, %v", standard, err)
	}
	for _, tc := range []struct {
		name     string
		count    int32
		absorbed bool
		quote    int64
		fee      int32
	}{
		{"one ticket", 1, false, 5400, 400},
		{"two tickets", 2, false, 10800, 800},
		{"organizer covers two tickets", 2, true, 10000, 800},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := seedFreeBookingFixture(t, pool)
			h := &CheckoutHandler{queries: q, db: pool}
			if tc.absorbed {
				if _, err := pool.Exec(ctx, `UPDATE events SET organizer_absorbs_service_fee=true WHERE id=$1`, f.eventID); err != nil {
					t.Fatal(err)
				}
			} else {
				// An old app either omits the quote or still displays the previous
				// standard. Neither may reserve stock or initiate a Stripe payment.
				oldQuote := int64(tc.count) * 5450
				for _, quote := range []*int64{nil, &oldQuote} {
					request := context.WithValue(ctx, expectedCheckoutTotalKey{}, quote)
					_, _, _, _, _, _, err := h.reserveOrder(request, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): tc.count}, tc.count, "", BillingDetailsRequest{Type: "individual", Country: "RO"})
					var changed *checkoutRequestError
					if !errors.As(err, &changed) || changed.message != "CHECKOUT_PRICE_CHANGED" {
						t.Fatalf("stale quote accepted: %v", err)
					}
				}
				var sold, orders int
				if err := pool.QueryRow(ctx, `SELECT tickets_sold, (SELECT count(*) FROM orders WHERE event_id=$1) FROM ticket_types WHERE id=$2`, f.eventID, f.paidTicketID).Scan(&sold, &orders); err != nil || sold != 0 || orders != 0 {
					t.Fatalf("stale quote consumed inventory/orders: sold=%d orders=%d err=%v", sold, orders, err)
				}
			}
			request := context.WithValue(ctx, expectedCheckoutTotalKey{}, &tc.quote)
			order, _, _, _, _, _, err := h.reserveOrder(request, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): tc.count}, tc.count, "", BillingDetailsRequest{Type: "individual", Country: "RO"})
			if err != nil {
				t.Fatal(err)
			}
			if order.PlatformFeeBani != tc.fee || int64(order.TotalAmount)*100+int64(order.CustomerTicketingFeeBani) != tc.quote || order.InvoiceServiceFeeBani != 0 {
				t.Fatalf("wrong checkout amounts: subtotal=%d fee=%d customerFee=%d invoiceFee=%d", order.TotalAmount, order.PlatformFeeBani, order.CustomerTicketingFeeBani, order.InvoiceServiceFeeBani)
			}
		})
	}
}

func TestCheckoutNegotiatedCommissionAndPriceProtection(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	ctx := context.Background()
	f := seedFreeBookingFixture(t, pool)
	q := db.New(pool)
	h := &CheckoutHandler{queries: q, db: pool}
	override, err := q.SetOrganizerCommission(ctx, db.SetOrganizerCommissionParams{OrganizerID: f.ownerID, UpdatedBy: f.ownerID, RateBps: pgtype.Int4{Int32: 225, Valid: true}, PerTicketBani: pgtype.Int4{Int32: 100, Valid: true}})
	if err != nil {
		t.Fatal(err)
	}
	reserve := func(expected *int64) (db.Orders, error) {
		requestCtx := context.WithValue(ctx, expectedCheckoutTotalKey{}, expected)
		order, _, _, _, _, _, err := h.reserveOrder(requestCtx, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Name: "Test", Address: "Test", City: "Test", County: "Test", Country: "RO"})
		return order, err
	}
	// 50 RON + ceil(112.5 bani) + 100 bani = 52.13 RON.
	oldQuote := int64(5450)
	for _, expected := range []*int64{nil, &oldQuote} {
		_, err := reserve(expected)
		var changed *checkoutRequestError
		if !errors.As(err, &changed) || changed.message != "CHECKOUT_PRICE_CHANGED" {
			t.Fatalf("stale/legacy quote accepted: %v", err)
		}
	}
	var reserved int
	_ = pool.QueryRow(ctx, `SELECT tickets_sold FROM ticket_types WHERE id=$1`, f.paidTicketID).Scan(&reserved)
	if reserved != 0 {
		t.Fatal("stale quote reserved inventory")
	}
	expected := int64(5213)
	order, err := reserve(&expected)
	if err != nil {
		t.Fatal(err)
	}
	if order.PlatformFeeBani != 213 || order.CustomerTicketingFeeBani != 213 || order.TotalAmount != 50 || order.Status != db.OrderStatusPending {
		t.Fatalf("wrong order: fee=%d customer=%d total=%d status=%s", order.PlatformFeeBani, order.CustomerTicketingFeeBani, order.TotalAmount, order.Status)
	}
	_, err = q.SetOrganizerCommission(ctx, db.SetOrganizerCommissionParams{OrganizerID: f.ownerID, UpdatedBy: f.ownerID, ExpectedRevision: override.Revision, RateBps: pgtype.Int4{Int32: 700, Valid: true}, PerTicketBani: pgtype.Int4{Int32: 300, Valid: true}})
	if err != nil {
		t.Fatal(err)
	}
	var snapshot int
	_ = pool.QueryRow(ctx, `SELECT platform_fee_bani FROM orders WHERE id=$1`, order.ID).Scan(&snapshot)
	if snapshot != 213 {
		t.Fatal("existing payment repriced")
	}
	expected = 5650
	next, err := reserve(&expected)
	if err != nil || next.PlatformFeeBani != 650 {
		t.Fatalf("new order fee=%d err=%v", next.PlatformFeeBani, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE events SET organizer_absorbs_service_fee=true WHERE id=$1`, f.eventID); err != nil {
		t.Fatal(err)
	}
	expected = 5000
	covered, err := reserve(&expected)
	if err != nil || covered.PlatformFeeBani != 650 || covered.CustomerTicketingFeeBani != 0 {
		t.Fatalf("covered order fee=%d customer=%d err=%v", covered.PlatformFeeBani, covered.CustomerTicketingFeeBani, err)
	}
}
