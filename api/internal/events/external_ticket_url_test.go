package events

import "testing"

func TestExternalTicketURLValidation(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		valid   bool
		present bool
	}{
		{name: "empty clears link", value: "  ", valid: true, present: false},
		{name: "https with path and query", value: "https://tickets.example.com/event/42?ref=spottr", valid: true, present: true},
		{name: "http rejected", value: "http://tickets.example.com/event", valid: false},
		{name: "credentials rejected", value: "https://user:pass@tickets.example.com/event", valid: false},
		{name: "relative rejected", value: "/tickets/event", valid: false},
		{name: "javascript rejected", value: "javascript:alert(1)", valid: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result, err := externalTicketURL(test.value)
			if (err == nil) != test.valid {
				t.Fatalf("externalTicketURL(%q) error=%v", test.value, err)
			}
			if err == nil && result.Valid != test.present {
				t.Fatalf("externalTicketURL(%q) present=%v, want %v", test.value, result.Valid, test.present)
			}
		})
	}
}
