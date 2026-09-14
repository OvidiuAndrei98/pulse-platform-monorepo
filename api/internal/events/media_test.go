package events

import "testing"

func TestManagedEventBannerKey(t *testing.T) {
	t.Setenv("PUBLIC_API_URL", "https://pulse-api.example.com")
	const ownerID = "ea79b1ed-99b1-4000-a000-000000000001"
	const filename = "0123456789abcdef0123456789abcdef.jpg"

	key, ok := ownedEventBannerKey("https://pulse-api.example.com/api/v1/media/events/"+ownerID+"/"+filename, ownerID)
	if !ok || key != "events/"+ownerID+"/"+filename {
		t.Fatalf("expected managed event key, got %q (%t)", key, ok)
	}
}

func TestOwnedEventBannerKeyRejectsUntrustedURLs(t *testing.T) {
	t.Setenv("PUBLIC_API_URL", "https://pulse-api.example.com")
	const ownerID = "ea79b1ed-99b1-4000-a000-000000000001"
	const otherID = "ea79b1ed-99b1-4000-a000-000000000002"
	const filename = "0123456789abcdef0123456789abcdef.jpg"
	validPrefix := "https://pulse-api.example.com/api/v1/media/events/"

	for _, candidate := range []string{
		"https://images.example.com/banner.jpg",
		validPrefix + otherID + "/" + filename,
		validPrefix + ownerID + "-suffix/" + filename,
		validPrefix + ownerID + "/../" + filename,
		validPrefix + ownerID + "/%2e%2e%2f" + filename,
		validPrefix + ownerID + "/" + filename + "?download=true",
		validPrefix + ownerID + "/" + filename + "#fragment",
		validPrefix + ownerID + "/short.jpg",
		validPrefix + ownerID + "/0123456789ABCDEF0123456789ABCDEF.jpg",
		validPrefix + ownerID + "/0123456789abcdef0123456789abcdef.svg",
	} {
		if key, ok := ownedEventBannerKey(candidate, ownerID); ok {
			t.Fatalf("untrusted URL accepted: %q as %q", candidate, key)
		}
	}
}
