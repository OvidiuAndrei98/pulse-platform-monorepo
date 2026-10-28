package diagnostics

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var testNow = time.Date(2026, 10, 12, 12, 0, 0, 0, time.UTC)

func testReport(n int) Report {
	return Report{ID: fmt.Sprintf("00000000-0000-4000-8000-%012d", n), OccurredAt: testNow, Platform: "ios", AppVersion: "1.0.0", BuildVersion: "12", OSVersion: "26.0", ErrorType: "TypeError", Category: "property_access", Fatal: true, Screen: "Checkout", Breadcrumbs: []string{"Home", "Checkout"}, Frames: []Frame{{File: "index.bundle", Function: "showTicket", Line: 1, Column: 2048}}}
}

type memoryStore struct {
	saved    []Report
	rows     []Entry
	err      error
	calls    int
	platform string
	cursor   *Cursor
}

func (s *memoryStore) Save(ctx context.Context, r Report, _ string) error {
	s.calls++
	if _, ok := ctx.Deadline(); !ok {
		return errors.New("missing deadline")
	}
	s.saved = append(s.saved, r)
	return s.err
}
func (s *memoryStore) List(_ context.Context, platform string, cursor *Cursor) ([]Entry, error) {
	s.calls++
	s.platform = platform
	s.cursor = cursor
	return s.rows, s.err
}
func (s *memoryStore) Cleanup(context.Context) error { return nil }
func body(v any) string                              { data, _ := json.Marshal(v); return string(data) }
func ingest(h *Handler, input string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.Ingest(w, httptest.NewRequest("POST", "/diagnostics/errors", strings.NewReader(input)))
	return w
}

func TestIngestValidation(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Report)
	}{
		{"id", func(r *Report) { r.ID = "bad" }},
		{"expired", func(r *Report) { r.OccurredAt = testNow.Add(-7*24*time.Hour - time.Second) }},
		{"future", func(r *Report) { r.OccurredAt = testNow.Add(5*time.Minute + time.Second) }},
		{"platform", func(r *Report) { r.Platform = "other" }},
		{"version", func(r *Report) { r.AppVersion = "Bearer private" }},
		{"type", func(r *Report) { r.ErrorType = "Error|TypeError" }},
		{"category", func(r *Report) { r.Category = "private message" }},
		{"screen", func(r *Report) { r.Screen = "Event/private-id" }},
		{"breadcrumb", func(r *Report) { r.Breadcrumbs = []string{"private"} }},
		{"breadcrumbs limit", func(r *Report) { r.Breadcrumbs = make([]string, 9) }},
		{"frame count", func(r *Report) { r.Frames = make([]Frame, 13) }},
		{"frame path", func(r *Report) { r.Frames[0].File = "https://host/index.js" }},
		{"frame secret", func(r *Report) { r.Frames[0].Function = "sk_test_private" }},
		{"negative offset", func(r *Report) { r.Frames[0].Line = -1 }},
		{"huge offset", func(r *Report) { r.Frames[0].Column = 100000001 }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := testReport(1)
			tt.mutate(&r)
			s := &memoryStore{}
			h := &Handler{Store: s, Now: func() time.Time { return testNow }}
			w := ingest(h, body(r))
			if w.Code != 400 || s.calls != 0 {
				t.Fatalf("status=%d writes=%d", w.Code, s.calls)
			}
		})
	}
}

func TestHandledFailuresAreBoundedAndGrouped(t *testing.T) {
	r := testReport(1)
	r.Operation, r.Failure, r.HTTPStatus = "tickets_load", "server_error", 503
	s := &memoryStore{}
	h := &Handler{Store: s, Now: func() time.Time { return testNow }}
	if w := ingest(h, body(r)); w.Code != 204 || len(s.saved) != 1 || s.saved[0].HTTPStatus != 503 {
		t.Fatalf("handled report not saved: %d", w.Code)
	}
	for _, mutate := range []func(*Report){
		func(r *Report) { r.Operation = "/users/private/tickets" },
		func(r *Report) { r.Failure = "private-message" },
		func(r *Report) { r.HTTPStatus = 400 },
		func(r *Report) { r.HTTPStatus = 600 },
		func(r *Report) { r.Operation = "" },
		func(r *Report) { r.Failure = "" },
	} {
		bad := r
		mutate(&bad)
		if ingest(h, body(bad)).Code != 400 || len(s.saved) != 1 {
			t.Fatal("unbounded handled context accepted")
		}
	}
	other := r
	other.ID = testReport(2).ID
	other.Frames = nil
	if fingerprint(r) != fingerprint(other) {
		t.Fatal("retry call sites must group together")
	}
	other.Operation = "scanner_sync"
	if fingerprint(r) == fingerprint(other) {
		t.Fatal("independent operations must remain distinct")
	}
}
func TestIngestRejectsRawDataAndInvalidJSON(t *testing.T) {
	valid := body(testReport(1))
	for _, input := range []string{"", "null", "[]", valid + valid, strings.TrimSuffix(valid, "}") + `,"message":"private-value"}`, strings.TrimSuffix(valid, "}") + `,"userId":"private-value"}`, strings.Replace(valid, `"fatal":true`, `"fatal":"true"`, 1), valid + strings.Repeat(" ", 12288)} {
		s := &memoryStore{}
		h := &Handler{Store: s, Now: func() time.Time { return testNow }}
		w := ingest(h, input)
		if w.Code != 400 || s.calls != 0 {
			t.Fatalf("expected rejected report, status=%d writes=%d", w.Code, s.calls)
		}
		if strings.Contains(w.Body.String(), "private-value") {
			t.Fatal("error echoed raw input")
		}
	}
}
func TestIngestSuccessAndUnavailable(t *testing.T) {
	s := &memoryStore{}
	h := &Handler{Store: s, Now: func() time.Time { return testNow }}
	r := testReport(1)
	r.Frames = nil
	r.Breadcrumbs = nil
	w := ingest(h, body(r))
	if w.Code != 204 || w.Header().Get("Cache-Control") != "no-store" || len(s.saved) != 1 {
		t.Fatalf("%d: %s", w.Code, w.Body)
	}
	if s.saved[0].Frames == nil || s.saved[0].Breadcrumbs == nil {
		t.Fatal("arrays must be normalized")
	}
	s.err = errors.New("private database error")
	w = ingest(h, body(r))
	if w.Code != 503 || strings.Contains(w.Body.String(), "private") {
		t.Fatalf("unexpected response %d: %s", w.Code, w.Body)
	}
}
func TestReportTimeBoundariesAndFingerprint(t *testing.T) {
	r := testReport(1)
	for _, date := range []time.Time{testNow.Add(-7 * 24 * time.Hour), testNow.Add(5 * time.Minute)} {
		r.OccurredAt = date
		if !r.valid(testNow) {
			t.Fatal("boundary rejected")
		}
	}
	other := testReport(2)
	other.OccurredAt = testNow.Add(-time.Hour)
	if fingerprint(r) != fingerprint(other) {
		t.Fatal("report ID/time should not change fingerprint")
	}
	other.BuildVersion = "13"
	if fingerprint(r) == fingerprint(other) {
		t.Fatal("builds must be distinguished")
	}
}
func TestAdminListFiltersPaginationAndErrors(t *testing.T) {
	s := &memoryStore{}
	h := &Handler{Store: s}
	for _, query := range []string{"?platform=bad", "?cursor=not-base64!", "?cursor=" + strings.Repeat("a", 257)} {
		w := httptest.NewRecorder()
		h.List(w, httptest.NewRequest("GET", "/admin/client-errors"+query, nil))
		if w.Code != 400 || s.calls != 0 {
			t.Fatalf("bad filter: %d calls %d", w.Code, s.calls)
		}
	}
	for i := 1; i <= 26; i++ {
		s.rows = append(s.rows, Entry{Report: testReport(i), ReceivedAt: testNow, Fingerprint: fingerprint(testReport(i))})
	}
	w := httptest.NewRecorder()
	h.List(w, httptest.NewRequest("GET", "/admin/client-errors?platform=ios", nil))
	var page struct {
		Items []Entry `json:"items"`
		Next  string  `json:"nextCursor"`
	}
	if json.Unmarshal(w.Body.Bytes(), &page) != nil || len(page.Items) != 25 || page.Next == "" || s.platform != "ios" {
		t.Fatalf("bad page %s", w.Body)
	}
	cursor, err := parseCursor(page.Next)
	if err != nil || cursor.ID != testReport(25).ID || !cursor.Time.Equal(testNow) {
		t.Fatal("cursor does not match last visible item")
	}
	s.rows = nil
	w = httptest.NewRecorder()
	h.List(w, httptest.NewRequest("GET", "/admin/client-errors?cursor="+page.Next, nil))
	if !bytes.Contains(w.Body.Bytes(), []byte(`"items":[]`)) || s.cursor == nil || s.cursor.ID != cursor.ID {
		t.Fatalf("bad empty page %s", w.Body)
	}
	s.err = errors.New("private")
	w = httptest.NewRecorder()
	h.List(w, httptest.NewRequest("GET", "/admin/client-errors", nil))
	if w.Code != 503 || strings.Contains(w.Body.String(), "private") {
		t.Fatal("unsafe unavailable response")
	}
}
