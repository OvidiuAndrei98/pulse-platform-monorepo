package payments

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stripe/stripe-go/v85"
)

func TestConnectWebhookAcceptsSignedUnhandledEvent(t *testing.T) {
	secret := "whsec_connect_test_secret"
	signedPayload := stripe.GenerateTestSignedPayload(&stripe.UnsignedPayload{
		Payload: []byte(`{"id":"evt_connect_test","object":"event","api_version":"2025-01-27.acacia","type":"customer.created"}`),
		Secret:  secret,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/stripe/connect/webhook", strings.NewReader(string(signedPayload.Payload)))
	req.Header.Set("Stripe-Signature", signedPayload.Header)
	response := httptest.NewRecorder()

	NewConnectWebhookHandler(nil, secret, nil).HandleStripeConnectWebhook(response, req)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, response.Code)
	}
}
