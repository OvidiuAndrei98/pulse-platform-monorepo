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
