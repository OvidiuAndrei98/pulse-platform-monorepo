package payments

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/stripe/stripe-go/v85"
)

func TestIsStripeAccountMissing(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "resource missing code",
			err:  &stripe.Error{Code: stripe.ErrorCodeResourceMissing},
			want: true,
		},
		{
			name: "wrapped not found",
			err:  fmt.Errorf("retrieve account: %w", &stripe.Error{HTTPStatusCode: http.StatusNotFound}),
			want: true,
		},
		{
			name: "another Stripe error",
			err:  &stripe.Error{HTTPStatusCode: http.StatusBadRequest},
			want: false,
		},
		{
			name: "non Stripe error",
			err:  errors.New("network error"),
			want: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isStripeAccountMissing(test.err); got != test.want {
				t.Fatalf("isStripeAccountMissing() = %t, want %t", got, test.want)
			}
		})
	}
}
