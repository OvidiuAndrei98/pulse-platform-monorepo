package auth

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestNativeGoogleLoginRequiresClientNonceAndKeepsDestinationBounded(t *testing.T) {
	h := &Handler{}
	h.ConfigureGoogleOAuth(GoogleOAuthConfig{ClientID: "test-client", ClientSecret: "test-secret", PublicAPIURL: "https://api.example.test", PublicAppURL: "https://example.test"})
	for _, nonce := range []string{"", strings.Repeat("a", 31), strings.Repeat("a", 129)} {
		w := httptest.NewRecorder()
		h.HandleGoogleLogin(w, httptest.NewRequest(http.MethodGet, "/auth/google?client=native&clientNonce="+nonce, nil))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("invalid nonce length %d accepted: %d", len(nonce), w.Code)
		}
	}
	w := httptest.NewRecorder()
	nonce := strings.Repeat("a", 36)
	h.HandleGoogleLogin(w, httptest.NewRequest(http.MethodGet, "/auth/google?client=native&clientNonce="+nonce+"&previewOrigin=https%3A%2F%2Fevil.test", nil))
	if w.Code != http.StatusFound {
		t.Fatalf("login: %d %s", w.Code, w.Body.String())
	}
	target, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.SplitN(target.Query().Get("state"), ".", 2)
	if len(parts) != 2 {
		t.Fatal("missing state")
	}
	var state googleOAuthState
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	if !state.Native || state.ClientNonce != nonce || state.PreviewOrigin != "" {
		t.Fatalf("invalid native state: %#v", state)
	}
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == googleStateCookie && cookie.Value == parts[0] && cookie.HttpOnly && cookie.Secure {
			return
		}
	}
	t.Fatal("missing CSRF cookie")
}

func TestGoogleNativeCallbackUsesFixedSchemeOrExactPreviewOrigin(t *testing.T) {
	config := GoogleOAuthConfig{PublicAppURL: "https://app.example.test/", MobileAppScheme: "spottr"}
	for _, row := range []struct{ origin, base string }{
		{"", "spottr-native://auth/google/callback"},
		{"https://evil.test", "spottr-native://auth/google/callback"},
		{"http://localhost:8081.evil.test", "spottr-native://auth/google/callback"},
		{"http://localhost:8081", "http://localhost:8081/auth/google/callback"},
		{"http://127.0.0.1:8081", "http://127.0.0.1:8081/auth/google/callback"},
	} {
		result, err := url.Parse(googleCallbackURL(config, googleOAuthState{Native: true, PreviewOrigin: row.origin, ClientNonce: "nonce", ReturnTo: "https://evil.test"}, "token&x=#"))
		if err != nil {
			t.Fatal(err)
		}
		fragment, err := url.ParseQuery(result.EscapedFragment())
		if err != nil {
			t.Fatal(err)
		}
		result.Fragment = ""
		if result.String() != row.base || fragment.Get("token") != "token&x=#" || fragment.Get("clientNonce") != "nonce" || fragment.Get("returnTo") == "https://evil.test" {
			t.Fatalf("unsafe callback: %s %#v", result, fragment)
		}
	}
	for _, row := range []struct {
		state  googleOAuthState
		prefix string
	}{
		{googleOAuthState{}, "https://app.example.test/auth/google/callback#"},
		{googleOAuthState{Mobile: true}, "spottr://auth/google/callback#"},
	} {
		if !strings.HasPrefix(googleCallbackURL(config, row.state, "token"), row.prefix) {
			t.Fatal("existing web or Capacitor return changed")
		}
	}
}
