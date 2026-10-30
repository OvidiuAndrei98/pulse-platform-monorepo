package router

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5/middleware"
)

func TestRequestCorrelationReplacesUntrustedHeaders(t *testing.T) {
	for _, status := range []int{200, 400, 503} {
		for _, injected := range []string{"583f24c4-53cd-482e-a324-487a9b7c2846", "private@example.test", ""} {
			r := httptest.NewRequest("GET", "/", nil)
			r.Header.Set("X-Request-ID", injected)
			w := httptest.NewRecorder()
			var loggedID string
			requestCorrelation(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				loggedID = middleware.GetReqID(r.Context())
				w.WriteHeader(status)
			})).ServeHTTP(w, r)
			id := w.Header().Get("X-Request-ID")
			if id == injected || id != loggedID || !regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`).MatchString(id) || w.Code != status {
				t.Fatal("request correlation must use a new opaque server ID on every response")
			}
		}
	}
}

func TestInternalErrorResponsesDoNotExposeMessages(t *testing.T) {
	w := httptest.NewRecorder()
	RespondWithError(w, 500, "SQLSTATE 42P08 private@example.test Bearer sk_test_private")
	if strings.Contains(w.Body.String(), "private") || strings.Contains(w.Body.String(), "SQLSTATE") || !strings.Contains(w.Body.String(), `"diagnosticCode":"DATABASE_ERROR"`) {
		t.Fatal("internal error body must contain only a safe public message and bounded diagnostic code")
	}
}

func TestRouterExposesCorrelationHeaderThroughCORS(t *testing.T) {
	var cfg HandlersConfig
	fields := reflect.ValueOf(&cfg).Elem()
	stub := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	for i := 0; i < fields.NumField(); i++ {
		if fields.Field(i).Type() == reflect.TypeOf(stub) {
			fields.Field(i).Set(reflect.ValueOf(stub))
		}
	}
	pass := func(next http.Handler) http.Handler { return next }
	cfg.AuthMiddleware, cfg.OptionalAuthMiddleware, cfg.ScannerAuthMiddleware, cfg.OrganizerMiddleware, cfg.AdminMiddleware = pass, pass, pass, pass, pass
	r := httptest.NewRequest("GET", "/health", nil)
	r.Header.Set("Origin", "http://localhost:3000")
	w := httptest.NewRecorder()
	SetupRouter(cfg).ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("X-Request-ID") == "" || !strings.Contains(strings.ToLower(w.Header().Get("Access-Control-Expose-Headers")), "x-request-id") {
		t.Fatal("browser clients cannot read server correlation IDs")
	}
}
