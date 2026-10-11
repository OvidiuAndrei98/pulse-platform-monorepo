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

func TestExpoWebCheckoutReturnOrigins(t *testing.T) {
	h := &CheckoutHandler{appURL: "https://dev.spottr.ro", expectedLiveModeKnown: true}
	for _, origin := range []string{"http://localhost:8082", "http://127.0.0.1:8081", "http://[::1]:8082"} {
		if !h.allowedWebReturnOrigin(origin) {
			t.Fatalf("test preview rejected: %s", origin)
		}
		if got := h.checkoutSuccessURL(checkoutClientNativeWeb, "event", "{CHECKOUT_SESSION_ID}", origin); got != origin+"/checkout/return?eventId=event&sessionId={CHECKOUT_SESSION_ID}" {
			t.Fatal(got)
		}
		if got := h.checkoutCancelURL(checkoutClientNativeWeb, "event", origin); got != origin+"/checkout/return?eventId=event&cancelled=1" {
			t.Fatal(got)
		}
	}
	for _, origin := range []string{"", "//localhost:8082", "http://localhost.evil.test:8082", "http://localhost:8082@evil.test", "http://localhost:8082/path", "http://localhost:8082?redirect=x", "http://localhost:8082#x", "http://localhost:8082?", "https://outside.test", "http://192.168.1.4:8082"} {
		if h.allowedWebReturnOrigin(origin) {
			t.Fatalf("unsafe origin accepted: %s", origin)
		}
	}
	h.expectedLiveMode = true
	if h.allowedWebReturnOrigin("http://localhost:8082") {
		t.Fatal("implicit localhost enabled for live payments")
	}
	h.ConfigureWebCheckoutReturns("https://preview.spottr.ro,https://outside.test/path")
	if !h.allowedWebReturnOrigin("https://preview.spottr.ro") || h.allowedWebReturnOrigin("https://outside.test/path") {
		t.Fatal("explicit origin allowlist failed")
	}
	parsed, _ := url.Parse(h.checkoutSuccessURL(checkoutClientNativeWeb, "event&bad=1", "cs_test_example", "https://preview.spottr.ro"))
	if parsed.Query().Get("eventId") != "event&bad=1" || len(parsed.Query()) != 2 {
		t.Fatal("query injection")
	}
}

func TestExpoWebRejectsUnconfiguredReturnBeforeReserving(t *testing.T) {
	h := &CheckoutHandler{configured: true, expectedLiveModeKnown: true}
	for _, req := range []CreateCheckoutRequest{
		{Client: checkoutClientNativeWeb}, {Client: checkoutClientNativeWeb, ReturnOrigin: "https://outside.test"},
		{ReturnOrigin: "http://localhost:8082"}, {Client: checkoutClientNativeSheet, ReturnOrigin: "http://localhost:8082"},
	} {
		payload, _ := json.Marshal(req)
		w := httptest.NewRecorder()
		h.HandleCreateCheckout(w, httptest.NewRequest(http.MethodPost, "/checkout", bytes.NewReader(payload)))
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "revenire") {
			t.Fatalf("unexpected status %d %s", w.Code, w.Body.String())
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
