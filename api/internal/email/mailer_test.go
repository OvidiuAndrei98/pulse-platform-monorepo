package email

import (
	"strings"
	"testing"
)

func TestEmailLayoutUsesSpottrBrandAndEscapesDynamicText(t *testing.T) {
	result := emailLayout("preview <unsafe>", "title <unsafe>", "<p>trusted content</p>")
	for _, expected := range []string{"SPOTTR", "spottr.ro", "preview &lt;unsafe&gt;", "title &lt;unsafe&gt;", "<p>trusted content</p>"} {
		if !strings.Contains(result, expected) {
			t.Fatalf("email layout does not contain %q", expected)
		}
	}
	if strings.Contains(result, "Glow") {
		t.Fatal("legacy brand found in email layout")
	}
}

func TestSanitizeHeaderRemovesLineBreaks(t *testing.T) {
	if got := sanitizeHeader("Event\r\nBcc: attacker@example.com"); got != "Event  Bcc: attacker@example.com" {
		t.Fatalf("sanitizeHeader() = %q", got)
	}
}
