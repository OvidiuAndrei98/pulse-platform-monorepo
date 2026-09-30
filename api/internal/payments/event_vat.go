package payments

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
	db "pulse-api/db/generated"
)

// Manual inclusive tax rates report the existing price, never increase it.
// Rates belong to the direct-charge account and are isolated by Stripe mode.
func (h *CheckoutHandler) eventTaxRate(ctx context.Context, account string, value pgtype.Numeric) (string, error) {
	rate, err := value.Float64Value()
	if err != nil || !rate.Valid || math.IsNaN(rate.Float64) || math.IsInf(rate.Float64, 0) || rate.Float64 < 0 || rate.Float64 > 100 {
		return "", errors.New("event VAT is not configured")
	}
	if rate.Float64 == 0 {
		return "", nil
	}
	if !h.expectedLiveModeKnown || account == "" {
		return "", errors.New("unknown Stripe tax context")
	}
	cached, err := h.queries.GetStripeEventVATRate(ctx, db.GetStripeEventVATRateParams{ConnectedAccountID: account, Livemode: h.expectedLiveMode, Percentage: value})
	if err == nil {
		return cached, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	params := &stripe.TaxRateCreateParams{DisplayName: stripe.String("TVA"), Country: stripe.String("RO"), Inclusive: stripe.Bool(true), Percentage: stripe.Float64(rate.Float64)}
	params.SetStripeAccount(account)
	params.SetIdempotencyKey(fmt.Sprintf("spottr-event-vat-v1-%s-%t-%s", account, h.expectedLiveMode, strconv.FormatFloat(rate.Float64, 'f', 2, 64)))
	created, err := h.client.V1TaxRates.Create(ctx, params)
	if err != nil {
		return "", err
	}
	if created == nil || created.ID == "" || !created.Inclusive || created.Livemode != h.expectedLiveMode || math.Abs(created.Percentage-rate.Float64) > 0.000001 {
		return "", errors.New("invalid Stripe tax rate response")
	}
	if err := h.queries.SaveStripeEventVATRate(ctx, db.SaveStripeEventVATRateParams{ConnectedAccountID: account, Livemode: h.expectedLiveMode, Percentage: value, StripeTaxRateID: created.ID}); err != nil {
		return "", err
	}
	return created.ID, nil
}

func applyInclusiveEventVAT(params *stripe.CheckoutSessionCreateParams, rate pgtype.Numeric, taxRateID string) {
	value, _ := rate.Float64Value()
	percentage := strconv.FormatFloat(value.Float64, 'f', 2, 64)
	params.AddMetadata("spottr_vat_percentage", percentage)
	params.PaymentIntentData.AddMetadata("spottr_vat_percentage", percentage)
	for _, item := range params.LineItems {
		item.PriceData.TaxBehavior = stripe.String("inclusive")
		if taxRateID != "" {
			item.TaxRates = []*string{stripe.String(taxRateID)}
		}
	}
}
