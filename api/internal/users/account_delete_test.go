package users

import "testing"

func TestSameAccountConfirmation(t *testing.T) {
	t.Parallel()
	if !sameAccountConfirmation("  Test.User@Example.COM ", "test.user@example.com") {
		t.Fatal("expected trimmed, case-insensitive email confirmation to match")
	}
	if sameAccountConfirmation("other@example.com", "test.user@example.com") {
		t.Fatal("different email must not confirm account deletion")
	}
}
