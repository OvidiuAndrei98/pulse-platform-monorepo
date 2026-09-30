package users

import "testing"

func TestNormalizeBillingDetails(t *testing.T) {
	valid := BillingDetails{
		Type: "company", Name: " Test SRL ", TaxID: " RO123 ", RegistrationNumber: " J1/2/2026 ",
		Address: " Strada Test 1 ", City: " Cluj-Napoca ", County: " Cluj ", Country: " Romania ",
	}
	normalized, err := NormalizeBillingDetails(valid)
	if err != nil {
		t.Fatalf("valid details rejected: %v", err)
	}
	if normalized.Name != "Test SRL" || normalized.TaxID != "RO123" {
		t.Fatalf("details were not trimmed: %#v", normalized)
	}

	bucharest := BillingDetails{Type: "individual", Name: "Test User", Address: "Strada Test 1", City: "Bucuresti", County: "", Sector: "Sector 2", Country: "Romania", TaxID: "must-clear"}
	normalized, err = NormalizeBillingDetails(bucharest)
	if err != nil || normalized.County != "Bucuresti" || normalized.TaxID != "" {
		t.Fatalf("Bucharest individual details were not normalized: %#v, %v", normalized, err)
	}

	outsideBucharest := BillingDetails{Type: "individual", Name: "Test User", Address: "Street 1", City: "Cluj", County: "Cluj", Sector: "Sector 2", Country: "Romania"}
	normalized, err = NormalizeBillingDetails(outsideBucharest)
	if err != nil || normalized.Sector != "" {
		t.Fatalf("sector outside Bucharest was not cleared: %#v, %v", normalized, err)
	}
}

func TestNormalizeBillingDetailsRejectsInvalidInput(t *testing.T) {
	base := BillingDetails{Type: "individual", Name: "Test User", Address: "Street 1", City: "Cluj", County: "Cluj", Country: "Romania"}
	tests := []struct {
		name   string
		mutate func(*BillingDetails)
	}{
		{"invalid type", func(value *BillingDetails) { value.Type = "other" }},
		{"missing name", func(value *BillingDetails) { value.Name = "" }},
		{"company without tax id", func(value *BillingDetails) { value.Type = "company" }},
		{"Bucharest without sector", func(value *BillingDetails) { value.City = "Bucuresti"; value.County = "" }},
		{"Bucharest with invalid sector", func(value *BillingDetails) { value.City = "Bucuresti"; value.Sector = "Sector 7" }},
		{"outside Bucharest without county", func(value *BillingDetails) { value.County = "" }},
		{"oversized address", func(value *BillingDetails) { value.Address = string(make([]byte, 301)) }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := base
			test.mutate(&value)
			if _, err := NormalizeBillingDetails(value); err == nil {
				t.Fatal("invalid details were accepted")
			}
		})
	}
}
