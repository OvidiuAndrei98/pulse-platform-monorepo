package tickets

import (
	"encoding/json"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
)

func TestMapUserTicketPreservesOrderIdentityAndOmitsMissingLegacyOrder(t *testing.T) {
	var orderID, eventID pgtype.UUID
	_ = orderID.Scan("11111111-1111-4111-8111-111111111111")
	_ = eventID.Scan("22222222-2222-4222-8222-222222222222")
	for _, order := range []pgtype.UUID{orderID, {}} {
		encoded, err := json.Marshal(MapUserTicket(db.GetUserTicketsRow{OrderID: order, EventID: eventID}))
		if err != nil {
			t.Fatal(err)
		}
		var response map[string]any
		if err := json.Unmarshal(encoded, &response); err != nil {
			t.Fatal(err)
		}
		if order.Valid {
			if response["orderId"] != "11111111-1111-4111-8111-111111111111" {
				t.Fatalf("order identity missing or replaced by event: %v", response["orderId"])
			}
		} else if _, exists := response["orderId"]; exists {
			t.Fatal("missing legacy order must be omitted rather than inventing an identifier")
		}
	}
}

func TestMapUserTicketUsesRecordedAmountsAndIncludedVAT(t *testing.T) {
	for _, test := range []struct {
		rate    string
		wantVAT int64
	}{{"21", 1487}, {"0", 0}, {"9", 708}} {
		t.Run(test.rate, func(t *testing.T) {
			var rate pgtype.Numeric
			if err := rate.Scan(test.rate); err != nil {
				t.Fatal(err)
			}
			got := MapUserTicket(db.GetUserTicketsRow{TicketPriceBani: 8000, TicketFeeBani: 570, TicketVatPercentage: rate, UnitPriceRon: 999})
			if got.TicketPriceBani != 8000 || got.TicketingFeeBani != 570 || got.PaidTotalBani != 8570 {
				t.Fatalf("incorrect historical total: %+v", got)
			}
			if got.VatAmountBani == nil || *got.VatAmountBani != test.wantVAT {
				t.Fatalf("incorrect included VAT: %+v", got.VatAmountBani)
			}
		})
	}
}

func TestMapLegacyTicketDoesNotInventVAT(t *testing.T) {
	got := MapUserTicket(db.GetUserTicketsRow{TicketPriceBani: 5000, TicketFeeBani: 450})
	if got.VatAmountBani != nil || got.VatPercentage != nil || got.PaidTotalBani != 5450 {
		t.Fatalf("legacy VAT must remain unknown: %+v", got)
	}
}

func TestMapUserOrderKeepsQuoteSeparateFromPurchaseStatus(t *testing.T) {
	for _, status := range []db.OrderStatus{db.OrderStatusPending, db.OrderStatusFailed, db.OrderStatusCompleted, db.OrderStatusRefunded} {
		got := MapUserOrder(db.ListUserOrdersRow{Status: status, TotalAmount: 50, PaidTotalBani: 5450, InvoiceRequested: true})
		if got.OrderTotalBani != 5450 || got.Status != string(status) || !got.InvoiceRequested {
			t.Fatalf("quote or purchase status lost: %+v", got)
		}
		if got.PaidTotalBani != got.OrderTotalBani {
			t.Fatal("legacy quote alias must remain compatible with installed clients")
		}
	}
}
