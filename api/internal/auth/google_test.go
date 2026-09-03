package auth

import "testing"

func TestGoogleAccountTypeOnlyAllowsPublicRoles(t *testing.T) {
	tests := []struct {
		value string
		want  string
	}{
		{value: "organizer", want: "organizer"},
		{value: "user", want: "user"},
		{value: "admin", want: "user"},
		{value: "", want: "user"},
	}

	for _, test := range tests {
		if got := googleAccountType(test.value); got != test.want {
			t.Fatalf("googleAccountType(%q) = %q, want %q", test.value, got, test.want)
		}
	}
}
