package invoicing

import "testing"

func TestResolveEventVATName(t *testing.T) {
	options := []VATRateOption{{Name: "Standard", Percentage: 21}, {Name: "Reduced", Percentage: 11}, {Name: "No VAT", Percentage: 0}}
	for _, option := range options {
		name, err := resolveEventVATName(options, option.Percentage)
		if err != nil || name != option.Name {
			t.Fatalf("wrong name for %v: %s %v", option.Percentage, name, err)
		}
	}
	if _, err := resolveEventVATName(options, 9); err == nil {
		t.Fatal("missing provider rate should require review")
	}
	options = append(options, VATRateOption{Name: "Exempt", Percentage: 0})
	if _, err := resolveEventVATName(options, 0); err == nil {
		t.Fatal("ambiguous treatment should require review")
	}
}
