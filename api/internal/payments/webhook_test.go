package payments

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stripe/stripe-go/v85"
)

func TestStripeWebhookAcceptsValidSignature(t *testing.T) {
	secret := "whsec_test_secret"
	signedPayload := stripe.GenerateTestSignedPayload(&stripe.UnsignedPayload{
		Payload: []byte(`{"id":"evt_test","object":"event","api_version":"2025-01-27.acacia","type":"customer.created"}`),
		Secret:  secret,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stripe/webhook", strings.NewReader(string(signedPayload.Payload)))
	req.Header.Set("Stripe-Signature", signedPayload.Header)
	response := httptest.NewRecorder()

	NewWebhookHandler(secret, nil, nil).HandleStripeWebhook(response, req)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}
}

func TestStripeWebhookRejectsInvalidSignature(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stripe/webhook", strings.NewReader(`{}`))
	req.Header.Set("Stripe-Signature", "invalid")
	response := httptest.NewRecorder()

	NewWebhookHandler("whsec_test_secret", nil, nil).HandleStripeWebhook(response, req)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, response.Code)
	}
}

func TestStripeWebhookIgnoresTestEventWhenLiveKeyIsConfigured(t *testing.T) {
	secret := "whsec_test_secret"
	signedPayload := stripe.GenerateTestSignedPayload(&stripe.UnsignedPayload{
		Payload: []byte(`{"id":"evt_test","object":"event","livemode":false,"api_version":"2025-01-27.acacia","type":"checkout.session.completed","data":{"object":{}}}`),
		Secret:  secret,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stripe/webhook", strings.NewReader(string(signedPayload.Payload)))
	req.Header.Set("Stripe-Signature", signedPayload.Header)
	response := httptest.NewRecorder()
	checkout := NewCheckoutHandler(nil, nil, "sk_live_example", "", nil, nil, nil)

	NewWebhookHandler(secret, checkout, nil).HandleStripeWebhook(response, req)

	if response.Code != http.StatusOK {
		t.Fatalf("expected mismatched test webhook to be acknowledged and ignored with %d, got %d", http.StatusOK, response.Code)
	}
}

func TestFirstStripeMetadataPrefersSpottrAndSupportsLegacyPulse(t *testing.T) {
	metadata := map[string]string{
		"spottr_order_id": "new-order",
		"pulse_order_id":  "legacy-order",
	}
	if got := firstStripeMetadata(metadata, "spottr_order_id", "pulse_order_id"); got != "new-order" {
		t.Fatalf("metadata value = %q, want new-order", got)
	}

	delete(metadata, "spottr_order_id")
	if got := firstStripeMetadata(metadata, "spottr_order_id", "pulse_order_id"); got != "legacy-order" {
		t.Fatalf("legacy metadata value = %q, want legacy-order", got)
	}
}
