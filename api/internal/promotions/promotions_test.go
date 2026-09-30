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

func TestPromotionCatalogSeparatesBannerAndFeedPrices(t *testing.T) {
	t.Setenv("PROMOTION_ONE_DAY_PRICE_RON", "")
	t.Setenv("PROMOTION_THU_SAT_PRICE_RON", "")
	t.Setenv("PROMOTION_FULL_WEEK_PRICE_RON", "")
	t.Setenv("PROMOTION_FEED_ONE_DAY_PRICE_RON", "")
	t.Setenv("PROMOTION_FEED_THU_SAT_PRICE_RON", "")
	t.Setenv("PROMOTION_FEED_FULL_WEEK_PRICE_RON", "")

	expected := map[string]int32{
		"home_banner:one_day":   50,
		"home_banner:thu_sat":   120,
		"home_banner:full_week": 200,
		"feed:one_day":          10,
		"feed:thu_sat":          25,
		"feed:full_week":        50,
	}
	for _, plan := range plans() {
		key := plan.Placement + ":" + plan.ID
		if amount, ok := expected[key]; !ok || amount != plan.AmountRon {
			t.Fatalf("unexpected plan %s with amount %d", key, plan.AmountRon)
		}
		delete(expected, key)
	}
	if len(expected) != 0 {
		t.Fatalf("missing plans: %v", expected)
	}
}

func TestBannerReservationPolicy(t *testing.T) {
	if homeBannerCapacity != 5 {
		t.Fatalf("home banner capacity = %d, expected 5", homeBannerCapacity)
	}
	if promotionReservationDuration != 10*time.Minute {
		t.Fatalf("reservation duration = %v, expected 10m", promotionReservationDuration)
	}
}

func TestPromotionBillingUsesVerifiedOrganizerIdentity(t *testing.T) {
	billing, err := normalizePromotionBillingDetails(
		promotionBillingDetailsRequest{
			RegistrationNumber: "J40/123/2026",
			Address:            "Strada Exemplu 1",
			City:               "Cluj-Napoca",
			County:             "Cluj",
			Country:            "Romania",
		},
		"Firma Oficiala SRL",
		"RO12345678",
	)
	if err != nil {
		t.Fatalf("normalizePromotionBillingDetails returned error: %v", err)
	}
	if billing.Type != "company" || billing.Name != "Firma Oficiala SRL" || billing.TaxID != "RO12345678" {
		t.Fatalf("promotion billing did not use the organizer identity: %#v", billing)
	}
}

func TestPromotionBillingRequiresVerifiedCompanyIdentity(t *testing.T) {
	_, err := normalizePromotionBillingDetails(
		promotionBillingDetailsRequest{
			Address: "Strada Exemplu 1",
			City:    "Cluj-Napoca",
			County:  "Cluj",
			Country: "Romania",
		},
		"",
		"",
	)
	if err == nil {
		t.Fatal("expected missing organizer identity to be rejected")
	}
}
