package places

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

const testSession = "00000000-0000-4000-8000-000000000001"

func fakeHandler(t *testing.T, body string, check func(*http.Request)) *Handler {
	t.Helper()
	h := NewHandler("server-secret")
	h.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.URL.Host != "maps.googleapis.com" || r.URL.Scheme != "https" {
			t.Fatalf("unexpected destination %s", r.URL.Host)
		}
		if r.URL.Query().Get("key") != "server-secret" {
			t.Fatal("server key missing")
		}
		if check != nil {
			check(r)
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}, nil
	})
	return h
}

func invoke(fn http.HandlerFunc, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	fn(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

func TestAutocompleteValidatedBoundedAndEncoded(t *testing.T) {
	calls := 0
	h := fakeHandler(t, `{"status":"OK","predictions":[{"place_id":"ChIJ-one","description":"Club & Co, Bucuresti","structured_formatting":{"main_text":"Club & Co"}}]}`, func(r *http.Request) {
		calls++
		if r.URL.Query().Get("input") != "Club & Co" || r.URL.Query().Get("types") != "establishment" || r.URL.Query().Get("sessiontoken") != testSession || r.URL.Query().Get("language") != "ro" {
			t.Fatal("incorrect provider query")
		}
	})
	w := invoke(h.Autocomplete, "/?q=Club%20%26%20Co&language=ro&session="+testSession)
	if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status %d", w.Code)
	}
	var result []Prediction
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil || len(result) != 1 || result[0].Name != "Club & Co" {
		t.Fatalf("bad response %s", w.Body.String())
	}
	for _, path := range []string{"/?q=" + strings.Repeat("x", 121) + "&session=" + testSession, "/?q=Club&session=bad", "/?q=Club%0A&session=" + testSession} {
		if w := invoke(h.Autocomplete, path); w.Code != 400 {
			t.Errorf("bad query should fail: %s %d", path, w.Code)
		}
	}
	if w := invoke(h.Autocomplete, "/?q=x"); w.Code != 200 || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatal("short input should be empty")
	}
	if calls != 1 {
		t.Fatalf("invalid inputs reached provider: %d", calls)
	}
}

func TestProviderErrorsNeverLeakKeyAndEmptyResultsAreArrays(t *testing.T) {
	for _, body := range []string{`{"status":"REQUEST_DENIED","error_message":"server-secret"}`, `not json`, `{"status":"UNKNOWN_ERROR"}`} {
		w := invoke(fakeHandler(t, body, nil).Autocomplete, "/?q=Club&session="+testSession)
		if w.Code != 502 || strings.Contains(w.Body.String(), "server-secret") {
			t.Fatalf("unexpected failure %d %s", w.Code, w.Body.String())
		}
	}
	w := invoke(fakeHandler(t, `{"status":"ZERO_RESULTS"}`, nil).Autocomplete, "/?q=Club&session="+testSession)
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("empty result %s", w.Body.String())
	}
	h := NewHandler("")
	if w := invoke(h.Autocomplete, "/?q=Club&session="+testSession); w.Code != 503 {
		t.Fatal("missing key should be unavailable")
	}
	h = NewHandler("key")
	h.client.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) { return nil, errors.New("timeout server-secret") })
	w = invoke(h.Autocomplete, "/?q=Club&session="+testSession)
	if w.Code != 502 || strings.Contains(w.Body.String(), "server-secret") {
		t.Fatal("transport error leaked")
	}
}

func TestDetailsRequiresMatchingPlaceAndGeometry(t *testing.T) {
	for _, tc := range []struct {
		body string
		code int
	}{
		{`{"status":"OK","result":{"place_id":"ChIJ-one","name":"Club","geometry":{"location":{"lat":0,"lng":0}}}}`, 200},
		{`{"status":"OK","result":{"place_id":"ChIJ-one","name":"Club"}}`, 502},
		{`{"status":"OK","result":{"place_id":"ChIJ-other","name":"Club","geometry":{"location":{"lat":44,"lng":26}}}}`, 502},
		{`{"status":"OK","result":{"place_id":"ChIJ-one","name":"Club","geometry":{"location":{"lat":91,"lng":26}}}}`, 502},
		{`{"status":"NOT_FOUND"}`, 404},
	} {
		h := fakeHandler(t, tc.body, func(r *http.Request) {
			if r.URL.Query().Get("fields") != "place_id,name,geometry" || r.URL.Query().Get("place_id") != "ChIJ-one" {
				t.Fatal("incorrect details fields")
			}
		})
		w := invoke(h.Details, "/?placeId=ChIJ-one&session="+testSession)
		if w.Code != tc.code {
			t.Fatalf("expected %d got %d: %s", tc.code, w.Code, w.Body.String())
		}
	}
}
