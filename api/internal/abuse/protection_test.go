package abuse

import (
	"context"
	"crypto/hmac"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type memoryCounterStore struct {
	mu        sync.Mutex
	count     int
	windowEnd time.Time
	err       error
}

func (s *memoryCounterStore) consume(_ context.Context, _ string, _ []byte, _ int, window time.Duration) (int, time.Time, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return 0, time.Time{}, s.err
	}
	s.count++
	if s.windowEnd.IsZero() {
		s.windowEnd = time.Now().Add(window)
	}
	return s.count, s.windowEnd, nil
}

func (s *memoryCounterStore) clear(context.Context, string, []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.count = 0
	s.windowEnd = time.Time{}
	return s.err
}

func (s *memoryCounterStore) cleanup(context.Context) error { return s.err }

func testProtection(store counterStore, resolver IPResolver) *Protection {
	return &Protection{store: store, hashKey: []byte("01234567890123456789012345678901"), resolver: resolver}
}

func TestIPResolverIgnoresForwardingHeadersFromUntrustedPeer(t *testing.T) {
	resolver, err := NewIPResolver("10.0.0.0/8")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "198.51.100.20:443"
	request.Header.Set("X-Forwarded-For", "203.0.113.10")
	request.Header.Set("X-Real-IP", "203.0.113.11")
	request.Header.Set("True-Client-IP", "203.0.113.12")
	if got := resolver.ClientIP(request); got != "198.51.100.20" {
		t.Fatalf("ClientIP() = %q, want socket peer", got)
	}
}

func TestIPResolverUsesRightmostUntrustedAddressBehindTrustedProxy(t *testing.T) {
	resolver, err := NewIPResolver("10.0.0.0/8, 192.0.2.0/24")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "10.20.30.40:8443"
	request.Header.Set("X-Forwarded-For", "6.6.6.6, 198.51.100.42, 192.0.2.8")
	if got := resolver.ClientIP(request); got != "198.51.100.42" {
		t.Fatalf("ClientIP() = %q, want ALB-observed client", got)
	}
}

func TestIPResolverSupportsIPv6AndRejectsOversizedChains(t *testing.T) {
	resolver, err := NewIPResolver("2001:db8:1::/48")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "[2001:db8:1::10]:443"
	request.Header.Set("X-Forwarded-For", "2001:db8:2::20")
	if got := resolver.ClientIP(request); got != "2001:db8:2::20" {
		t.Fatalf("ClientIP() = %q", got)
	}
	request.Header.Set("X-Forwarded-For", strings.Repeat("1", maxForwardedHeaderBytes+1))
	if got := resolver.ClientIP(request); got != "2001:db8:1::10" {
		t.Fatalf("oversized XFF ClientIP() = %q, want peer", got)
	}
}

func TestIPResolverRejectsDuplicateForwardedHeaderLines(t *testing.T) {
	resolver, err := NewIPResolver("10.0.0.0/8")
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.RemoteAddr = "10.20.30.40:443"
	request.Header.Add("X-Forwarded-For", "6.6.6.6")
	request.Header.Add("X-Forwarded-For", "198.51.100.42")
	if got := resolver.ClientIP(request); got != "10.20.30.40" {
		t.Fatalf("duplicate XFF ClientIP() = %q, want trusted socket peer fallback", got)
	}
}

func TestMiddlewareStopsAtLimitAndSetsRetryAfter(t *testing.T) {
	store := &memoryCounterStore{}
	protection := testProtection(store, IPResolver{})
	called := 0
	handler := protection.Middleware("login_ip", 2, time.Minute)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called++
		w.WriteHeader(http.StatusNoContent)
	}))

	for attempt := 1; attempt <= 3; attempt++ {
		request := httptest.NewRequest(http.MethodPost, "/", nil)
		request.RemoteAddr = "198.51.100.7:1234"
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if attempt <= 2 && response.Code != http.StatusNoContent {
			t.Fatalf("attempt %d status = %d", attempt, response.Code)
		}
		if attempt == 3 {
			if response.Code != http.StatusTooManyRequests {
				t.Fatalf("limited status = %d", response.Code)
			}
			if response.Header().Get("Retry-After") == "" {
				t.Fatal("Retry-After is missing")
			}
		}
	}
	if called != 2 {
		t.Fatalf("handler called %d times, want 2", called)
	}
}

func TestMiddlewareFailsClosedWhenStoreFails(t *testing.T) {
	store := &memoryCounterStore{err: context.DeadlineExceeded}
	protection := testProtection(store, IPResolver{})
	handler := protection.Middleware("login_ip", 1, time.Minute)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("handler must not run")
	}))
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	request.RemoteAddr = "198.51.100.8:1234"
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", response.Code)
	}
}

func TestInvalidTrustedProxyConfigurationIsRejected(t *testing.T) {
	if _, err := NewIPResolver("not-a-network"); err == nil {
		t.Fatal("invalid CIDR was accepted")
	}
}

func TestSubjectDigestIsStableDomainSeparatedAndDoesNotExposeSubject(t *testing.T) {
	protection := testProtection(&memoryCounterStore{}, IPResolver{})
	first := protection.SubjectDigest("reservation_ip", "198.51.100.7")
	second := protection.SubjectDigest("reservation_ip", "198.51.100.7")
	otherScope := protection.SubjectDigest("login_ip", "198.51.100.7")
	if len(first) != 32 || !hmac.Equal(first, second) {
		t.Fatal("subject digest must be a stable SHA-256 HMAC")
	}
	if hmac.Equal(first, otherScope) {
		t.Fatal("subject digest must be domain separated")
	}
	if strings.Contains(string(first), "198.51.100.7") {
		t.Fatal("subject digest exposed the raw subject")
	}
}
