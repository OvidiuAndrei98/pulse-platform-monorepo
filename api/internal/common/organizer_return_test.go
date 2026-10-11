package common

import (
	"net/url"
	"testing"
)

func TestOrganizerReturnURLsKeepWebAndFixedNativeDestinations(t *testing.T) {
	for _, tc := range []struct{ client, flow, status, expected string }{
		{"", "connect", "complete", "/dashboard?stripe=complete"},
		{"", "connect", "refresh", "/dashboard?stripe=refresh"},
		{"", "promotion", "complete", "/dashboard/promotions?payment=success"},
		{"", "promotion", "cancelled", "/dashboard/promotions?payment=cancelled"},
	} {
		if got := OrganizerReturnURL("https://spottr.test", tc.client, tc.flow, tc.status, "id"); got != "https://spottr.test"+tc.expected {
			t.Fatalf("unexpected return %s", got)
		}
	}
	for _, client := range []string{"native", "native-preview"} {
		parsed, _ := url.Parse(OrganizerReturnURL("https://spottr.test", client, "promotion", "complete", "id&flow=connect"))
		if parsed.Host != "spottr.test" || parsed.Path != "/organizers/native-return" || parsed.Query().Get("flow") != "promotion" || parsed.Query().Get("campaignId") != "id&flow=connect" {
			t.Fatalf("unsafe return %s", parsed)
		}
		if (parsed.Query().Get("client") == "preview") != (client == "native-preview") {
			t.Fatal("preview mismatch")
		}
	}
	for _, client := range []string{"https://evil.test", "native&redirect=evil", "mobile"} {
		if ValidOrganizerClient(client) {
			t.Fatal("invalid client accepted")
		}
	}
}
