package payments

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
)

func TestCheckoutReturnURLsKeepWebCompatibilityAndUseFixedNativeRoute(t *testing.T) {
	h := &CheckoutHandler{appURL: "https://app.example.test"}
	eventID := "34eaaab3-d59a-48bf-94b3-3e4c22405d70"
	for _, tc := range []struct{ client, success, cancel string }{
		{"", "/checkout/success?event_id=" + eventID + "&session_id={CHECKOUT_SESSION_ID}", "/events/" + eventID + "?checkout=cancelled"},
		{"native", "/checkout/native-return?event_id=" + eventID + "&session_id={CHECKOUT_SESSION_ID}", "/checkout/native-return?event_id=" + eventID + "&cancelled=1"},
	} {
		if got := h.checkoutSuccessURL(tc.client, eventID, "{CHECKOUT_SESSION_ID}"); got != h.appURL+tc.success {
			t.Errorf("success URL for %q: %q", tc.client, got)
		}
		if got := h.checkoutCancelURL(tc.client, eventID); got != h.appURL+tc.cancel {
			t.Errorf("cancel URL for %q: %q", tc.client, got)
		}
	}
}

func TestCheckoutReturnURLsEncodeValuesWithoutChangingDestination(t *testing.T) {
	h := &CheckoutHandler{appURL: "https://app.example.test"}
	eventID, sessionID := "event&cancelled=1", "cs_test_value&redirect=https://outside.invalid/#fragment"
	for _, client := range []string{"", "native"} {
		parsed, err := url.Parse(h.checkoutSuccessURL(client, eventID, sessionID))
		if err != nil || parsed.Host != "app.example.test" || parsed.Query().Get("event_id") != eventID || parsed.Query().Get("session_id") != sessionID || parsed.Fragment != "" || len(parsed.Query()) != 2 {
			t.Fatalf("return parameters changed destination or query: %v %v", parsed, err)
		}
	}
}

func TestCheckoutRejectsUnknownClientsBeforeCreatingAnOrder(t *testing.T) {
	h := &CheckoutHandler{configured: true} // No database or Stripe client: invalid input must stop first.
	for _, client := range []string{"web", "NATIVE", " native ", "https://outside.invalid", "spottr-native://checkout/return"} {
		payload, _ := json.Marshal(CreateCheckoutRequest{Client: client})
		w := httptest.NewRecorder()
		h.HandleCreateCheckout(w, httptest.NewRequest(http.MethodPost, "/checkout", bytes.NewReader(payload)))
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "Clientul") {
			t.Fatalf("client %q was not rejected: %d %s", client, w.Code, w.Body.String())
		}
	}
}

func TestCheckoutClientPreservesLegacyRequestHashAndSeparatesNativeIntent(t *testing.T) {
	// The serialized payload is hashed and persisted. Adding an omitted client
	// must not make an in-flight purchase from an older web version conflict.
	type legacyRequest struct {
		Email          string                `json:"email"`
		Items          []CheckoutItemRequest `json:"items"`
		PromoCode      string                `json:"promoCode"`
		BillingDetails BillingDetailsRequest `json:"billingDetails"`
	}
	req := CreateCheckoutRequest{Email: "buyer@example.test", Items: []CheckoutItemRequest{{TicketTypeID: "tier", Quantity: 2}}, PromoCode: "SAVE", BillingDetails: BillingDetailsRequest{Type: "individual", Name: "Buyer"}}
	var eventID pgtype.UUID
	if err := eventID.Scan("34eaaab3-d59a-48bf-94b3-3e4c22405d70"); err != nil {
		t.Fatal(err)
	}
	legacy, _ := json.Marshal(struct {
		EventID pgtype.UUID
		Request legacyRequest
	}{eventID, legacyRequest{req.Email, req.Items, req.PromoCode, req.BillingDetails}})
	current, _ := json.Marshal(struct {
		EventID pgtype.UUID
		Request CreateCheckoutRequest
	}{eventID, req})
	if !bytes.Equal(legacy, current) {
		t.Fatalf("legacy idempotency payload changed:\n%s\n%s", legacy, current)
	}
	req.Client = checkoutClientNative
	native, _ := json.Marshal(struct {
		EventID pgtype.UUID
		Request CreateCheckoutRequest
	}{eventID, req})
	if bytes.Equal(native, legacy) || !bytes.Contains(native, []byte(`"client":"native"`)) {
		t.Fatal("native and web intents must have different request hashes")
	}
}
