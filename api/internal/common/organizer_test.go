package common

import "testing"

func TestNormalizeOrganizerDetails(t *testing.T) {
	cui, companyName, err := NormalizeOrganizerDetails(" RO 12345678 ", "  Spottr   Events SRL ")
	if err != nil {
		t.Fatalf("NormalizeOrganizerDetails() error = %v", err)
	}
	if cui != "12345678" {
		t.Fatalf("cui = %q, want %q", cui, "12345678")
	}
	if companyName != "Spottr Events SRL" {
		t.Fatalf("companyName = %q, want %q", companyName, "Spottr Events SRL")
	}
}

func TestNormalizeOrganizerDetailsRejectsInvalidCUI(t *testing.T) {
	if _, _, err := NormalizeOrganizerDetails("RO12A4", "Spottr Events SRL"); err == nil {
		t.Fatal("expected invalid CUI to be rejected")
	}
}
