package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestConcurrencyBudgetRejectsAndReleases(t *testing.T) {
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	h := concurrentRequests(1)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { entered <- struct{}{}; <-release; w.WriteHeader(204) }))
	go func() { h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest("POST", "/upload", nil)); close(done) }()
	<-entered
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/upload", nil))
	if w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatalf("unbounded upload: %d", w.Code)
	}
	release <- struct{}{}
	<-done
	go func() { <-entered; release <- struct{}{} }()
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/upload", nil))
	if w.Code != 204 {
		t.Fatal("budget leaked after request")
	}
}
