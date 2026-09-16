package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeJSONRejectsOversizedAndAmbiguousBodies(t *testing.T) {
	tests := []struct {
		name string
		body string
		want int
	}{
		{name: "oversized", body: `{"value":"` + strings.Repeat("a", 100) + `"}`, want: http.StatusRequestEntityTooLarge},
		{name: "multiple objects", body: `{"value":"a"}{"value":"b"}`, want: http.StatusBadRequest},
		{name: "unknown field", body: `{"value":"a","unexpected":true}`, want: http.StatusBadRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(test.body))
			response := httptest.NewRecorder()
			var payload struct {
				Value string `json:"value"`
			}
			if DecodeJSON(response, request, &payload, 32) {
				t.Fatal("invalid body was accepted")
			}
			if response.Code != test.want {
				t.Fatalf("status = %d, want %d", response.Code, test.want)
			}
		})
	}
}

func TestDecodeJSONAcceptsOneKnownObject(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"value":"ok"}`))
	response := httptest.NewRecorder()
	var payload struct {
		Value string `json:"value"`
	}
	if !DecodeJSON(response, request, &payload, 32) {
		t.Fatalf("valid body rejected with %d", response.Code)
	}
	if payload.Value != "ok" {
		t.Fatalf("value = %q", payload.Value)
	}
}
