package safetygroups

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRetiredEventConversationNeverUsesDatabase(t *testing.T) {
	h := NewHandler(nil, nil)
	for _, handler := range []http.HandlerFunc{h.HandleGet, h.HandleCreate, h.HandleInvite, h.HandleRespond, h.HandleMessage, h.HandleHelp, h.HandleHelpResolved} {
		w := httptest.NewRecorder()
		handler(w, httptest.NewRequest("POST", "/events/any/safety-group", nil))
		if w.Code != 410 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("retired endpoint: %d %s", w.Code, w.Body.String())
		}
	}
}
