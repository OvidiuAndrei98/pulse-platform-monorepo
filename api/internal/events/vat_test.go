package events

import (
	"math"
	"testing"
)

func TestEventVATRequiresExplicitValidChoice(t *testing.T) {
	if _, err := eventVAT(nil); err == nil {
		t.Fatal("missing VAT was silently defaulted")
	}
	for _, value := range []float64{0, 11, 21} {
		n, err := eventVAT(&value)
		if err != nil || vatResponse(n) == nil || *vatResponse(n) != value {
			t.Fatalf("valid %v: %v", value, err)
		}
	}
	for _, value := range []float64{-1, 101, 100, 19, 9, 5.25, 2.001, 11.001, 21.001, math.NaN(), math.Inf(1), math.Inf(-1)} {
		if _, err := eventVAT(&value); err == nil {
			t.Fatalf("accepted %v", value)
		}
	}
}
