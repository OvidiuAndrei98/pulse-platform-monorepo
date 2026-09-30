package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestActivateBrowserLinkRedirectsToConfiguredApp(t *testing.T) {
	handler := &Handler{PublicAppURL: "https://dev.spottr.ro"}
	request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/activate", nil)
	response := httptest.NewRecorder()

	handler.HandleActivate(response, request)

	if response.Code != http.StatusSeeOther {
		t.Fatalf("expected %d, got %d", http.StatusSeeOther, response.Code)
	}
	if location := response.Header().Get("Location"); location != "https://dev.spottr.ro/login?activation=invalid" {
		t.Fatalf("unexpected redirect location %q", location)
	}
}
