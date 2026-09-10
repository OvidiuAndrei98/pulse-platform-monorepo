package invoicing

import (
	"testing"
	"time"
)

func TestPreviousCalendarMonthUsesBucharestBoundaries(t *testing.T) {
	start, end := previousCalendarMonth(time.Date(2026, time.April, 15, 12, 0, 0, 0, time.UTC))

	if got, want := start.Format(time.RFC3339), "2026-02-28T22:00:00Z"; got != want {
		t.Fatalf("start = %s, want %s", got, want)
	}
	if got, want := end.Format(time.RFC3339), "2026-03-31T21:00:00Z"; got != want {
		t.Fatalf("end = %s, want %s", got, want)
	}
}

func TestPreviousCalendarMonthAcrossYearBoundary(t *testing.T) {
	start, end := previousCalendarMonth(time.Date(2026, time.January, 20, 12, 0, 0, 0, time.UTC))

	location, err := time.LoadLocation("Europe/Bucharest")
	if err != nil {
		t.Fatal(err)
	}
	if got, want := start.In(location).Format("2006-01-02"), "2025-12-01"; got != want {
		t.Fatalf("start = %s, want %s", got, want)
	}
	if got, want := end.In(location).Format("2006-01-02"), "2026-01-01"; got != want {
		t.Fatalf("end = %s, want %s", got, want)
	}
}

func TestCustomerInvoiceIncludesTicketingAndProcessingFee(t *testing.T) {
	items := appendCustomerTicketingFee([]InvoiceItem{{Name: "Bilet", Quantity: 1, UnitPrice: 5}}, 270)

	if len(items) != 2 {
		t.Fatalf("invoice items = %d, want 2", len(items))
	}
	fee := items[1]
	if fee.Name != "Taxă de ticketing și procesare" || fee.UnitPrice != 2.70 || fee.Quantity != 1 {
		t.Fatalf("ticketing fee item = %#v", fee)
	}
	if got, want := customerInvoiceTotalRon(5, 270), 7.70; got != want {
		t.Fatalf("invoice total = %.2f, want %.2f", got, want)
	}
}

func TestCustomerInvoiceExcludesFeeCoveredByOrganizer(t *testing.T) {
	items := appendCustomerTicketingFee([]InvoiceItem{{Name: "Bilet", Quantity: 1, UnitPrice: 5}}, 0)

	if len(items) != 1 {
		t.Fatalf("invoice items = %d, want 1", len(items))
	}
	if got, want := customerInvoiceTotalRon(5, 0), 5.0; got != want {
		t.Fatalf("invoice total = %.2f, want %.2f", got, want)
	}
}
