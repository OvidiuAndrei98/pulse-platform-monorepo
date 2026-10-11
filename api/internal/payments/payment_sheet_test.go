package payments

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

func nativeIntentFixture() (db.Orders, stripe.PaymentIntent) {
	var orderID, eventID pgtype.UUID
	_ = orderID.Scan("11111111-1111-4111-8111-111111111111")
	_ = eventID.Scan("22222222-2222-4222-8222-222222222222")
	order := db.Orders{ID: orderID, EventID: eventID, TotalAmount: 100, PlatformFeeBani: 900, CustomerTicketingFeeBani: 900,
		StripePaymentIntentID:    pgtype.Text{String: "pi_native_test", Valid: true},
		StripeConnectedAccountID: pgtype.Text{String: "acct_native_test", Valid: true},
		StripeChargeType:         pgtype.Text{String: directChargeType, Valid: true}, StripeLivemode: pgtype.Bool{Valid: true}}
	intent := stripe.PaymentIntent{ID: order.StripePaymentIntentID.String, Amount: 10900, AmountReceived: 10900, Currency: stripe.CurrencyRON,
		ApplicationFeeAmount: 900, CaptureMethod: stripe.PaymentIntentCaptureMethodAutomatic, Status: stripe.PaymentIntentStatusSucceeded,
		Metadata: map[string]string{"spottr_order_id": common.UUIDToString(orderID), "spottr_event_id": common.UUIDToString(eventID), "spottr_client": checkoutClientNativeSheet}}
	return order, intent
}

func TestNativePaymentSheetConfigurationBeforeReservation(t *testing.T) {
	for _, test := range []struct {
		name, publicKey               string
		configured, known, live, want bool
	}{
		{"test", "pk_test_fixture", true, true, false, true},
		{"live", "pk_live_fixture", true, true, true, true},
		{"missing public", "", true, true, false, false},
		{"missing secret", "pk_test_fixture", false, true, false, false},
		{"unknown secret", "pk_test_fixture", true, false, false, false},
		{"test public live secret", "pk_test_fixture", true, true, true, false},
		{"live public test secret", "pk_live_fixture", true, true, false, false},
		{"empty suffix", "pk_test_", true, true, false, false},
		{"private key", "sk_test_fixture", true, true, false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			h := &CheckoutHandler{configured: test.configured, expectedLiveModeKnown: test.known, expectedLiveMode: test.live}
			h.ConfigureNativePaymentSheet(test.publicKey)
			if got := h.nativePaymentSheetConfigured(); got != test.want {
				t.Fatalf("configured=%t want=%t", got, test.want)
			}
			if !test.want {
				w := httptest.NewRecorder()
				h.HandleCreateCheckout(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"client":"native_sheet"}`)))
				if w.Code != http.StatusServiceUnavailable {
					t.Fatalf("status=%d; configuration must fail before DB", w.Code)
				}
			}
		})
	}
	h := &CheckoutHandler{configured: true, expectedLiveModeKnown: true, publishableKey: "pk_test_fixture"}
	w := httptest.NewRecorder()
	h.HandleCreateCheckout(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"client":"native_sheet"}`)))
	if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "Idempotency-Key") {
		t.Fatal("native payment must require idempotency before reservation")
	}
}

func TestNativePaymentIntentExactBinding(t *testing.T) {
	h := &CheckoutHandler{expectedLiveModeKnown: true}
	for _, test := range []struct {
		name   string
		mutate func(*db.Orders, *stripe.PaymentIntent, *string)
	}{
		{"wrong PI", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.ID = "pi_foreign" }},
		{"unbound PI", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { o.StripePaymentIntentID.Valid = false }},
		{"hosted session", func(o *db.Orders, p *stripe.PaymentIntent, a *string) {
			o.StripeCheckoutSessionID = pgtype.Text{String: "cs_original", Valid: true}
		}},
		{"foreign account", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { *a = "acct_foreign" }},
		{"platform account", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { *a = "" }},
		{"destination charge", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { o.StripeChargeType.String = "destination" }},
		{"order mode", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { o.StripeLivemode.Bool = true }},
		{"unknown order mode", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { o.StripeLivemode.Valid = false }},
		{"provider mode", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.Livemode = true }},
		{"amount missing fee", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.Amount = 10000 }},
		{"amount overpaid", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.Amount++ }},
		{"amount received missing", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.AmountReceived = 0 }},
		{"wrong currency", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.Currency = stripe.CurrencyEUR }},
		{"lost application fee", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.ApplicationFeeAmount = 0 }},
		{"manual capture", func(o *db.Orders, p *stripe.PaymentIntent, a *string) {
			p.CaptureMethod = stripe.PaymentIntentCaptureMethodManual
		}},
		{"missing metadata", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.Metadata = nil }},
		{"wrong event", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.Metadata["spottr_event_id"] = "foreign" }},
		{"wrong order", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.Metadata["spottr_order_id"] = "foreign" }},
		{"wrong client", func(o *db.Orders, p *stripe.PaymentIntent, a *string) { p.Metadata["spottr_client"] = "native" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			order, intent := nativeIntentFixture()
			account := order.StripeConnectedAccountID.String
			test.mutate(&order, &intent, &account)
			if h.validateNativePaymentIntent(order, &intent, account) == nil {
				t.Fatal("unsafe binding accepted")
			}
		})
	}
	order, intent := nativeIntentFixture()
	if err := h.validateNativePaymentIntent(order, &intent, order.StripeConnectedAccountID.String); err != nil {
		t.Fatal(err)
	}
	if h.validateNativePaymentIntent(order, nil, order.StripeConnectedAccountID.String) == nil {
		t.Fatal("nil intent accepted")
	}
	// A retryable failure need not have received funds, but can never fulfill.
	intent.Status = stripe.PaymentIntentStatusRequiresPaymentMethod
	intent.AmountReceived = 0
	if err := h.validateNativePaymentIntent(order, &intent, order.StripeConnectedAccountID.String); err != nil {
		t.Fatal(err)
	}
}

func TestNativePaymentSecretCapability(t *testing.T) {
	for _, test := range []struct {
		expected, provided string
		want               bool
	}{
		{"test-capability", "test-capability", true}, {"", "", false}, {"test-capability", "", false},
		{"test-capability", "wrong", false}, {"test-capability", "test-capability ", false},
		{strings.Repeat("x", 513), strings.Repeat("x", 513), false},
	} {
		if nativePaymentSecretMatches(test.expected, test.provided) != test.want {
			t.Fatal("capability validation mismatch")
		}
	}
}
