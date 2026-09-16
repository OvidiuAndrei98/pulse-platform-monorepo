package payments

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stripe/stripe-go/v85"
)

func TestCheckoutRejectsOversizedBodyBeforeReservation(t *testing.T) {
	handler := &CheckoutHandler{configured: true}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/events/3bb8a31e-eb30-4b81-a293-bbf94250f642/tickets/purchase", strings.NewReader(`{"email":"`+strings.Repeat("a", maxCheckoutJSONBytes)+`"}`))
	response := httptest.NewRecorder()
	handler.HandleCreateCheckout(response, request)
	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", response.Code)
	}
}

func TestStripeCreateFailureClassificationIsFailSafe(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		definitive bool
	}{
		{name: "validation 400", err: &stripe.Error{HTTPStatusCode: http.StatusBadRequest}, definitive: true},
		{name: "missing account 404", err: &stripe.Error{HTTPStatusCode: http.StatusNotFound}, definitive: true},
		{name: "timeout", err: context.DeadlineExceeded, definitive: false},
		{name: "request timeout", err: &stripe.Error{HTTPStatusCode: http.StatusRequestTimeout}, definitive: false},
		{name: "rate limit", err: &stripe.Error{HTTPStatusCode: http.StatusTooManyRequests}, definitive: false},
		{name: "server error", err: &stripe.Error{HTTPStatusCode: http.StatusBadGateway}, definitive: false},
		{name: "wrapped server error", err: fmt.Errorf("create: %w", &stripe.Error{HTTPStatusCode: http.StatusServiceUnavailable}), definitive: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isDefinitiveStripeCreateFailure(test.err); got != test.definitive {
				t.Fatalf("isDefinitiveStripeCreateFailure() = %t, want %t", got, test.definitive)
			}
		})
	}
}

func TestCheckoutSessionMustBeConfirmedExpiredBeforeInventoryRelease(t *testing.T) {
	expired := &stripe.CheckoutSession{Status: stripe.CheckoutSessionStatusExpired}
	open := &stripe.CheckoutSession{Status: stripe.CheckoutSessionStatusOpen}
	if !checkoutSessionConfirmedExpired(expired, nil) {
		t.Fatal("confirmed expired session was rejected")
	}
	if checkoutSessionConfirmedExpired(nil, nil) || checkoutSessionConfirmedExpired(open, nil) || checkoutSessionConfirmedExpired(expired, errors.New("transport failed")) {
		t.Fatal("unknown or payable session was treated as safe to release")
	}
}
