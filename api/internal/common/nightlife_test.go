package common

import (
	"testing"
	"time"
)

func TestCanonicalPlanningCityDisplayLabels(t *testing.T) {
	for _, sample := range []struct{ value, want string }{{"București", "Bucuresti"}, {" BUCUREŞTI ", "Bucuresti"}, {"Bucures\u0326ti", "Bucuresti"}, {"Iași", "Iasi"}, {"Timișoara", "Timisoara"}, {"Brașov", "Brasov"}, {"Constanța", "Constanta"}, {"Cluj-Napoca", "Cluj-Napoca"}, {"unsupported", ""}} {
		if got := CanonicalPlanningCity(sample.value); got != sample.want {
			t.Errorf("%q canonical city %q; expected %q", sample.value, got, sample.want)
		}
	}
}
func TestNightBoundsCalendarLocalAndDST(t *testing.T) {
	for _, sample := range []struct {
		day, start, end string
		hours           float64
	}{{"2026-11-19", "2026-11-19T04:00:00Z", "2026-11-20T04:00:00Z", 24}, {"2026-03-28", "2026-03-28T04:00:00Z", "2026-03-29T03:00:00Z", 23}, {"2026-10-24", "2026-10-24T03:00:00Z", "2026-10-25T04:00:00Z", 25}, {"2026-12-31", "2026-12-31T04:00:00Z", "2027-01-01T04:00:00Z", 24}} {
		a, b, err := NightBounds(sample.day)
		if err != nil || a.UTC().Format(time.RFC3339) != sample.start || b.UTC().Format(time.RFC3339) != sample.end || b.Sub(a).Hours() != sample.hours {
			t.Errorf("night %s: %v %v %v", sample.day, a, b, err)
		}
	}
	for _, day := range []string{"2026-02-30", "2026-11-19T00:00:00Z", "19-11-2026", ""} {
		if _, _, err := NightBounds(day); err == nil {
			t.Errorf("invalid date accepted: %s", day)
		}
	}
}
