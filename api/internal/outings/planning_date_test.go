package outings

import (
	"testing"
	"time"
)

func TestEmbeddedPlanningTimezoneAndDST(t *testing.T) {
	for _, sample := range []struct {
		month  time.Month
		offset int
	}{{time.January, 2 * 3600}, {time.July, 3 * 3600}} {
		_, offset := time.Date(2026, sample.month, 1, 12, 0, 0, 0, time.UTC).In(planningZone).Zone()
		if offset != sample.offset {
			t.Fatalf("Bucharest offset=%d want=%d", offset, sample.offset)
		}
	}
	now := time.Date(2026, time.November, 2, 22, 30, 0, 0, time.UTC)
	if !validPlanningDate("2026-11-03", now) || validPlanningDate("2026-11-02", now) {
		t.Fatal("date validation must use Romania calendar day")
	}
}
