package payments

import "testing"

import (
	"github.com/jackc/pgx/v5/pgtype"

	db "pulse-api/db/generated"
)

func TestCalculatePlatformFeeBani(t *testing.T) {
	tests := []struct {
		name        string
		totalBani   int64
		ticketCount int32
		want        int64
	}{
		{name: "single ten ron ticket", totalBani: 1000, ticketCount: 1, want: 290},
		{name: "round percentage up", totalBani: 999, ticketCount: 1, want: 290},
		{name: "multiple tickets", totalBani: 2000, ticketCount: 2, want: 580},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := calculatePlatformFeeBani(test.totalBani, test.ticketCount); got != test.want {
				t.Fatalf("calculatePlatformFeeBani() = %d, want %d", got, test.want)
			}
		})
	}
}

func TestGenerateValidationHash(t *testing.T) {
	first, err := generateValidationHash()
	if err != nil {
		t.Fatalf("generateValidationHash() error = %v", err)
	}
	second, err := generateValidationHash()
	if err != nil {
		t.Fatalf("generateValidationHash() error = %v", err)
	}
	if len(first) != 64 {
		t.Fatalf("validation hash length = %d, want 64", len(first))
	}
	if first == second {
		t.Fatal("validation hashes must be unique")
	}
}

func TestStripeSecretLiveMode(t *testing.T) {
	tests := []struct {
		name      string
		secret    string
		wantLive  bool
		wantKnown bool
	}{
		{name: "live secret", secret: "sk_live_example", wantLive: true, wantKnown: true},
		{name: "live restricted", secret: "rk_live_example", wantLive: true, wantKnown: true},
		{name: "test secret", secret: "sk_test_example", wantLive: false, wantKnown: true},
		{name: "test restricted", secret: "rk_test_example", wantLive: false, wantKnown: true},
		{name: "unknown", secret: "", wantLive: false, wantKnown: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			gotLive, gotKnown := stripeSecretLiveMode(test.secret)
			if gotLive != test.wantLive || gotKnown != test.wantKnown {
				t.Fatalf("stripeSecretLiveMode() = (%t, %t), want (%t, %t)", gotLive, gotKnown, test.wantLive, test.wantKnown)
			}
		})
	}
}

func TestStripeOrderContextMatchesDirectChargeAccount(t *testing.T) {
	order := db.Orders{
		StripeChargeType:         pgtype.Text{String: directChargeType, Valid: true},
		StripeConnectedAccountID: pgtype.Text{String: "acct_direct", Valid: true},
	}

	if !stripeOrderContextMatches(order, "acct_direct") {
		t.Fatal("expected the direct-charge account to match")
	}
	if stripeOrderContextMatches(order, "") || stripeOrderContextMatches(order, "acct_other") {
		t.Fatal("expected missing or different direct-charge account to be rejected")
	}
}

func TestStripeOrderContextMatchesLegacyPlatformEvent(t *testing.T) {
	order := db.Orders{
		StripeChargeType:         pgtype.Text{String: "destination", Valid: true},
		StripeConnectedAccountID: pgtype.Text{String: "acct_legacy", Valid: true},
	}

	if !stripeOrderContextMatches(order, "") {
		t.Fatal("expected a platform-scoped legacy event to match")
	}
	if stripeOrderContextMatches(order, "acct_legacy") {
		t.Fatal("expected a connected-account event to be rejected for a legacy destination charge")
	}
}

func TestNormalizeBillingDetailsKeepsBucharestAndSectorSeparate(t *testing.T) {
	details, err := normalizeBillingDetails(BillingDetailsRequest{
		Type:    "individual",
		Name:    "Andrei Popescu",
		Address: "Calea Victoriei 1",
		City:    "București",
		Sector:  "Sector 1",
		Country: "România",
	})
	if err != nil {
		t.Fatal(err)
	}
	if details.City != "Bucuresti" || details.County != "Bucuresti" || details.Sector != "Sector 1" {
		t.Fatalf("unexpected normalized Bucharest address: %#v", details)
	}
}

func TestNormalizeBillingDetailsRequiresBucharestSector(t *testing.T) {
	_, err := normalizeBillingDetails(BillingDetailsRequest{
		Type:    "individual",
		Name:    "Andrei Popescu",
		Address: "Calea Victoriei 1",
		City:    "Bucuresti",
		Country: "Romania",
	})
	if err == nil {
		t.Fatal("expected Bucharest address without sector to be rejected")
	}
}
