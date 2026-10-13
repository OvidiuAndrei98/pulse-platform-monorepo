package interactions

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestSearchRejectsInvalidFiltersBeforeDatabase(t *testing.T) {
	for _, query := range []string{"q=night&kind=admin", "q=" + url.QueryEscape(strings.Repeat("ș", 121))} {
		t.Run(query[:min(30, len(query))], func(t *testing.T) {
			response := httptest.NewRecorder()
			(&Handler{}).HandleSearchProfiles(response, httptest.NewRequest(http.MethodGet, "/profiles/search?"+query, nil))
			if response.Code != http.StatusBadRequest {
				t.Fatalf("got %d, want 400", response.Code)
			}
		})
	}
}

func TestEmptyProfileSearchDoesNotQueryDatabase(t *testing.T) {
	for _, kind := range []string{"", "people", "organizers"} {
		response := httptest.NewRecorder()
		(&Handler{}).HandleSearchProfiles(response, httptest.NewRequest(http.MethodGet, "/profiles/search?q=%20&kind="+kind, nil))
		if response.Code != http.StatusOK || strings.TrimSpace(response.Body.String()) != "[]" {
			t.Fatalf("kind %q: got %d %s", kind, response.Code, response.Body.String())
		}
	}
}
