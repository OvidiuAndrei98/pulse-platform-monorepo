package tickets

import (
	"testing"
	"time"
)

func TestOfflineScanTime(t *testing.T) {
	start := time.Date(2026, 10, 3, 18, 0, 0, 0, time.UTC)
	end := start.Add(8 * time.Hour)
	for _, tc := range []struct {
		name, value string
		now         time.Time
		valid       bool
	}{
		{"late delivery", start.Add(time.Hour).Format(time.RFC3339), end.Add(24 * time.Hour), true},
		{"expiry boundary", end.Format(time.RFC3339), end.Add(time.Hour), false},
		{"before download", start.Add(-time.Hour).Format(time.RFC3339), end, false},
		{"future scan", start.Add(time.Hour).Format(time.RFC3339), start, false},
		{"empty", "", end, false},
		{"invalid", "not-a-date", end, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := validOfflineScanTime(tc.value, start, end, tc.now); got != tc.valid {
				t.Fatalf("got %v, want %v", got, tc.valid)
			}
		})
	}
}
