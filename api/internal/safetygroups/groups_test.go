package safetygroups

import "testing"

func TestParseUniqueUUIDsRejectsInvalidAndEnforcesLimit(t *testing.T) {
	valid := "123e4567-e89b-12d3-a456-426614174000"
	other := "123e4567-e89b-12d3-a456-426614174001"

	ids, ok := parseUniqueUUIDs([]string{valid, valid, other})
	if !ok || len(ids) != 2 {
		t.Fatalf("expected two unique UUIDs, got ok=%v len=%d", ok, len(ids))
	}
	if _, ok := parseUniqueUUIDs([]string{"not-a-uuid"}); ok {
		t.Fatal("expected invalid UUID to be rejected")
	}
	if _, ok := parseUniqueUUIDs([]string{valid, valid, valid, valid, valid, valid, valid, valid}); ok {
		t.Fatal("expected more than seven invitations to be rejected")
	}
}
