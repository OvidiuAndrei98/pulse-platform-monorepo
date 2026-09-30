package tickets

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
)

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
