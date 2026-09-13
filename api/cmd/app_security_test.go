package app

import (
	"strings"
	"testing"
)

func TestInitApplicationRejectsUnsafeJWTBeforeDatabase(t *testing.T) {
	// No database/server/email configuration is needed to reject unsafe startup.
	for _, secret := range []string{"", "short", strings.Repeat("change-me", 5)} {
		t.Setenv("JWT_SECRET", secret)
		application, err := InitApplication()
		if application != nil || err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
			t.Fatal("unsafe startup did not fail at JWT validation")
		}
	}
}
