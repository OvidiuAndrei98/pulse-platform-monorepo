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
		Payload: []byte(`{"id":"evt_test","object":"event","api_version":"2025-01-27.acacia","type":"checkout.session.completed"}`),
		Secret:  secret,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stripe/webhook", strings.NewReader(string(signedPayload.Payload)))
	req.Header.Set("Stripe-Signature", signedPayload.Header)
	response := httptest.NewRecorder()

	NewWebhookHandler(secret).HandleStripeWebhook(response, req)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}
}

func TestStripeWebhookRejectsInvalidSignature(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stripe/webhook", strings.NewReader(`{}`))
	req.Header.Set("Stripe-Signature", "invalid")
	response := httptest.NewRecorder()

	NewWebhookHandler("whsec_test_secret").HandleStripeWebhook(response, req)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, response.Code)
	}
}
