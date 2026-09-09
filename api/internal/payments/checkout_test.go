package payments

import "testing"

func TestCalculatePlatformFeeBani(t *testing.T) {
	tests := []struct {
		name        string
		totalBani   int64
		ticketCount int32
		want        int64
	}{
		{name: "single ten ron ticket", totalBani: 1000, ticketCount: 1, want: 290},
		{name: "round percentage up", totalBani: 999, ticketCount: 1, want: 290},
		{name: "multiple tickets", totalBani: 2000, ticketCount: 2, want: 580},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := calculatePlatformFeeBani(test.totalBani, test.ticketCount); got != test.want {
				t.Fatalf("calculatePlatformFeeBani() = %d, want %d", got, test.want)
			}
		})
	}
}

func TestGenerateValidationHash(t *testing.T) {
	first, err := generateValidationHash()
	if err != nil {
		t.Fatalf("generateValidationHash() error = %v", err)
	}
	second, err := generateValidationHash()
	if err != nil {
		t.Fatalf("generateValidationHash() error = %v", err)
	}
	if len(first) != 64 {
		t.Fatalf("validation hash length = %d, want 64", len(first))
	}
	if first == second {
		t.Fatal("validation hashes must be unique")
	}
}

func TestNormalizeBillingDetailsKeepsBucharestAndSectorSeparate(t *testing.T) {
	details, err := normalizeBillingDetails(BillingDetailsRequest{
		Type:    "individual",
		Name:    "Andrei Popescu",
		Address: "Calea Victoriei 1",
		City:    "București",
		Sector:  "Sector 1",
		Country: "România",
	})
	if err != nil {
		t.Fatal(err)
	}
	if details.City != "Bucuresti" || details.County != "Bucuresti" || details.Sector != "Sector 1" {
		t.Fatalf("unexpected normalized Bucharest address: %#v", details)
	}
}

func TestNormalizeBillingDetailsRequiresBucharestSector(t *testing.T) {
	_, err := normalizeBillingDetails(BillingDetailsRequest{
		Type:    "individual",
		Name:    "Andrei Popescu",
		Address: "Calea Victoriei 1",
		City:    "Bucuresti",
		Country: "Romania",
	})
	if err == nil {
		t.Fatal("expected Bucharest address without sector to be rejected")
	}
}
