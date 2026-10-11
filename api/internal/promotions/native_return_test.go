package promotions

import (
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
	"testing"
)

func TestReconciliationRejectsForeignOrMismatchedStripeSession(t *testing.T) {
	base := stripe.CheckoutSession{ID: "cs_test_owned", Metadata: map[string]string{"pulse_promotion_campaign_id": "campaign"}, Mode: stripe.CheckoutSessionModePayment, Currency: stripe.CurrencyRON, AmountTotal: 5000, Livemode: false}
	mode := pgtype.Bool{Bool: false, Valid: true}
	if !validCampaignCheckout(&base, "campaign", base.ID, 5000, mode) {
		t.Fatal("valid session rejected")
	}
	if validCampaignCheckout(nil, "campaign", base.ID, 5000, mode) {
		t.Fatal("nil session accepted")
	}
	for _, mutate := range []func(*stripe.CheckoutSession){
		func(s *stripe.CheckoutSession) { s.ID = "cs_test_other" },
		func(s *stripe.CheckoutSession) {
			s.Metadata = map[string]string{"pulse_promotion_campaign_id": "other"}
		},
		func(s *stripe.CheckoutSession) { s.AmountTotal = 4999 },
		func(s *stripe.CheckoutSession) { s.Currency = stripe.CurrencyEUR },
		func(s *stripe.CheckoutSession) { s.Livemode = true },
		func(s *stripe.CheckoutSession) { s.Mode = stripe.CheckoutSessionModeSetup },
	} {
		other := base
		mutate(&other)
		if validCampaignCheckout(&other, "campaign", base.ID, 5000, mode) {
			t.Fatal("mismatched session accepted")
		}
	}
	if validCampaignCheckout(&base, "campaign", base.ID, 5000, pgtype.Bool{}) {
		t.Fatal("unknown payment mode accepted")
	}
}
