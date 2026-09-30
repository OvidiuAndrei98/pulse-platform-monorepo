package users

import "testing"

func TestOwnedAvatarKey(t *testing.T) {
	const userID = "11111111-1111-1111-1111-111111111111"
	const object = "0123456789abcdef0123456789abcdef.webp"
	const wanted = "avatars/" + userID + "/" + object
	tests := []struct {
		name string
		url  string
		want string
	}{
		{"own photo", "https://api.spottr.ro/api/v1/media/" + wanted, wanted},
		{"old API host", "https://old.spottr.ro/api/v1/media/" + wanted, wanted},
		{"external photo", "https://accounts.google.com/photo.jpg", ""},
		{"another user", "https://api.spottr.ro/api/v1/media/avatars/22222222-2222-2222-2222-222222222222/" + object, ""},
		{"nested path", "https://api.spottr.ro/api/v1/media/" + wanted + "/extra", ""},
		{"unexpected filename", "https://api.spottr.ro/api/v1/media/avatars/" + userID + "/other.jpg", ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := ownedAvatarKey(test.url, userID); got != test.want {
				t.Fatalf("ownedAvatarKey() = %q, want %q", got, test.want)
			}
		})
	}
}
