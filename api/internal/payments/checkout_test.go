package payments

import "testing"

import (
	"errors"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"

	db "pulse-api/db/generated"
)

func TestStripeChargeFullyRefunded(t *testing.T) {
	tests := []struct {
		name   string
		charge stripe.Charge
		want   bool
	}{
		{name: "partial amount", charge: stripe.Charge{Amount: 10000, AmountRefunded: 4000}, want: false},
		{name: "full cumulative amount", charge: stripe.Charge{Amount: 10000, AmountRefunded: 10000}, want: true},
		{name: "Stripe refunded flag", charge: stripe.Charge{Amount: 10000, AmountRefunded: 9000, Refunded: true}, want: true},
		{name: "zero amount is not a refund", charge: stripe.Charge{}, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := stripeChargeFullyRefunded(test.charge); got != test.want {
				t.Fatalf("stripeChargeFullyRefunded() = %t, want %t", got, test.want)
			}
		})
	}
}

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

func TestValidateRefundedChargeRequiresImmutablePaymentContext(t *testing.T) {
	baseOrder := db.Orders{
		StripePaymentIntentID:    pgtype.Text{String: "pi_expected", Valid: true},
		StripeConnectedAccountID: pgtype.Text{String: "acct_expected", Valid: true},
		StripeChargeType:         pgtype.Text{String: directChargeType, Valid: true},
		StripeLivemode:           pgtype.Bool{Bool: true, Valid: true},
		TotalAmount:              10,
		CustomerTicketingFeeBani: 290,
	}
	baseCharge := stripe.Charge{
		ID:             "ch_expected",
		PaymentIntent:  &stripe.PaymentIntent{ID: "pi_expected"},
		Amount:         1290,
		AmountRefunded: 1290,
		Currency:       stripe.CurrencyRON,
		Livemode:       true,
	}

	tests := []struct {
		name      string
		mutate    func(*db.Orders, *stripe.Charge)
		accountID string
		liveMode  bool
		wantError bool
	}{
		{name: "valid direct charge", accountID: "acct_expected", liveMode: true},
		{name: "wrong payment intent", accountID: "acct_expected", liveMode: true, wantError: true, mutate: func(_ *db.Orders, charge *stripe.Charge) { charge.PaymentIntent.ID = "pi_other" }},
		{name: "wrong total", accountID: "acct_expected", liveMode: true, wantError: true, mutate: func(_ *db.Orders, charge *stripe.Charge) { charge.Amount++ }},
		{name: "wrong currency", accountID: "acct_expected", liveMode: true, wantError: true, mutate: func(_ *db.Orders, charge *stripe.Charge) { charge.Currency = stripe.CurrencyEUR }},
		{name: "wrong connected account", accountID: "acct_other", liveMode: true, wantError: true},
		{name: "missing persisted livemode", accountID: "acct_expected", liveMode: true, wantError: true, mutate: func(order *db.Orders, _ *stripe.Charge) { order.StripeLivemode.Valid = false }},
		{name: "event mode mismatch", accountID: "acct_expected", liveMode: false, wantError: true},
		{name: "refund exceeds charge", accountID: "acct_expected", liveMode: true, wantError: true, mutate: func(_ *db.Orders, charge *stripe.Charge) { charge.AmountRefunded = charge.Amount + 1 }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			order := baseOrder
			charge := baseCharge
			paymentIntent := *baseCharge.PaymentIntent
			charge.PaymentIntent = &paymentIntent
			if test.mutate != nil {
				test.mutate(&order, &charge)
			}
			err := validateRefundedCharge(order, charge, test.accountID, test.liveMode)
			if (err != nil) != test.wantError {
				t.Fatalf("validateRefundedCharge() error = %v, wantError=%t", err, test.wantError)
			}
			if err != nil && !errors.Is(err, errStripeRefundBindingMismatch) {
				t.Fatalf("unexpected error type: %v", err)
			}
		})
	}
}

func TestValidateRefundedDestinationChargeRequiresStoredDestination(t *testing.T) {
	order := db.Orders{
		StripePaymentIntentID:    pgtype.Text{String: "pi_legacy", Valid: true},
		StripeConnectedAccountID: pgtype.Text{String: "acct_destination", Valid: true},
		StripeChargeType:         pgtype.Text{String: "destination", Valid: true},
		StripeLivemode:           pgtype.Bool{Bool: true, Valid: true},
		TotalAmount:              5,
	}
	charge := stripe.Charge{
		ID:             "ch_legacy",
		PaymentIntent:  &stripe.PaymentIntent{ID: "pi_legacy"},
		Amount:         500,
		AmountRefunded: 500,
		Currency:       stripe.CurrencyRON,
		Livemode:       true,
		TransferData: &stripe.ChargeTransferData{
			Destination: &stripe.Account{ID: "acct_destination"},
		},
	}
	if err := validateRefundedCharge(order, charge, "", true); err != nil {
		t.Fatalf("valid destination Charge rejected: %v", err)
	}
	charge.TransferData.Destination.ID = "acct_other"
	if err := validateRefundedCharge(order, charge, "", true); !errors.Is(err, errStripeRefundBindingMismatch) {
		t.Fatalf("wrong destination was not rejected: %v", err)
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
