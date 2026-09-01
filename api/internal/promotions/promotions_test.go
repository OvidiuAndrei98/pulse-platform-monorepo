package promotions

import (
	"testing"
	"time"
)

func futureDateForWeekday(weekday time.Weekday) time.Time {
	date := time.Now().In(bucharestLocation()).AddDate(1, 0, 0)
	for date.Weekday() != weekday {
		date = date.AddDate(0, 0, 1)
	}
	return date
}

func TestCampaignIntervalDurations(t *testing.T) {
	startDate := futureDateForWeekday(time.Thursday).Format("2006-01-02")
	tests := []struct {
		plan string
		days int
	}{
		{plan: "one_day", days: 1},
		{plan: "thu_sat", days: 3},
		{plan: "full_week", days: 7},
	}
	for _, test := range tests {
		t.Run(test.plan, func(t *testing.T) {
			start, end, err := campaignInterval(test.plan, startDate)
			if err != nil {
				t.Fatalf("campaignInterval returned error: %v", err)
			}
			if expected := start.AddDate(0, 0, test.days); !end.Equal(expected) {
				t.Fatalf("end = %v, expected %v", end, expected)
			}
		})
	}
}

func TestWeekendPlanRequiresThursday(t *testing.T) {
	startDate := futureDateForWeekday(time.Friday).Format("2006-01-02")
	if _, _, err := campaignInterval("thu_sat", startDate); err == nil {
		t.Fatal("expected Thursday validation error")
	}
}

func TestUnknownPlanIsRejected(t *testing.T) {
	startDate := futureDateForWeekday(time.Thursday).Format("2006-01-02")
	if _, _, err := campaignInterval("unknown", startDate); err == nil {
		t.Fatal("expected invalid plan error")
	}
}
