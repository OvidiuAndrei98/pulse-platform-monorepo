package events

import "testing"

func TestManagedEventBannerKey(t *testing.T) {
	t.Setenv("PUBLIC_API_URL", "https://pulse-api.example.com")

	key, ok := managedEventBannerKey("https://pulse-api.example.com/api/v1/media/events/user-id/banner.jpg")
	if !ok || key != "events/user-id/banner.jpg" {
		t.Fatalf("expected managed event key, got %q (%t)", key, ok)
	}
}

func TestManagedEventBannerKeyRejectsExternalURLs(t *testing.T) {
	t.Setenv("PUBLIC_API_URL", "https://pulse-api.example.com")

	if _, ok := managedEventBannerKey("https://images.example.com/banner.jpg"); ok {
		t.Fatal("expected external URL to be ignored")
	}
}
