package events

import "testing"

func TestIsOwnedOrganizerUpdateURL(t *testing.T) {
	t.Setenv("PUBLIC_API_URL", "https://pulse-api.example.com")
	userID := "8d54e7ad-c6bf-4e87-8528-e7411d8fa660"

	if !isOwnedOrganizerUpdateURL(
		"https://pulse-api.example.com/api/v1/media/organizer-updates/"+userID+"/image.webp",
		userID,
	) {
		t.Fatal("expected the organizer media URL to be accepted")
	}
	if isOwnedOrganizerUpdateURL(
		"https://pulse-api.example.com/api/v1/media/organizer-updates/other-user/image.webp",
		userID,
	) {
		t.Fatal("expected a different organizer media URL to be rejected")
	}
	if isOwnedOrganizerUpdateURL("https://example.com/image.webp", userID) {
		t.Fatal("expected an external image URL to be rejected")
	}
}
