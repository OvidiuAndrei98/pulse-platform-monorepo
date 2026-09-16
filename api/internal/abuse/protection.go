package abuse

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pulse-api/internal/router"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	maxForwardedHeaderBytes = 4096
	maxForwardedHops        = 32
	storeTimeout            = 2 * time.Second
)

type Decision struct {
	Allowed    bool
	RetryAfter time.Duration
}

type counterStore interface {
	consume(context.Context, string, []byte, int, time.Duration) (int, time.Time, error)
	clear(context.Context, string, []byte) error
	cleanup(context.Context) error
}

type postgresCounterStore struct {
	pool *pgxpool.Pool
}

func (s postgresCounterStore) consume(ctx context.Context, scope string, subjectHash []byte, limit int, window time.Duration) (int, time.Time, error) {
	var count int
	var windowEnd time.Time
	err := s.pool.QueryRow(ctx, `
INSERT INTO request_rate_limits (scope, subject_hash, attempt_count, window_end)
VALUES ($1, $2, 1, clock_timestamp() + make_interval(secs => $3::double precision))
ON CONFLICT (scope, subject_hash) DO UPDATE
	SET attempt_count = CASE
        WHEN request_rate_limits.window_end <= clock_timestamp() THEN 1
		ELSE LEAST(request_rate_limits.attempt_count + 1, $4::integer + 1)
    END,
    window_end = CASE
        WHEN request_rate_limits.window_end <= clock_timestamp()
            THEN clock_timestamp() + make_interval(secs => $3::double precision)
        ELSE request_rate_limits.window_end
    END,
    updated_at = clock_timestamp()
RETURNING attempt_count, window_end`, scope, subjectHash, window.Seconds(), limit).Scan(&count, &windowEnd)
	return count, windowEnd, err
}

func (s postgresCounterStore) clear(ctx context.Context, scope string, subjectHash []byte) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM request_rate_limits WHERE scope = $1 AND subject_hash = $2`, scope, subjectHash)
	return err
}

func (s postgresCounterStore) cleanup(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM request_rate_limits WHERE window_end < clock_timestamp() - INTERVAL '1 hour'`)
	return err
}

type IPResolver struct {
	trusted []*net.IPNet
}

func NewIPResolver(rawCIDRs string) (IPResolver, error) {
	resolver := IPResolver{}
	for _, raw := range strings.Split(rawCIDRs, ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		_, network, err := net.ParseCIDR(raw)
		if err != nil {
			return IPResolver{}, fmt.Errorf("invalid TRUSTED_PROXY_CIDRS entry %q", raw)
		}
		resolver.trusted = append(resolver.trusted, network)
	}
	return resolver, nil
}

func (r IPResolver) ClientIP(request *http.Request) string {
	peer := parseIP(request.RemoteAddr)
	if peer == nil {
		return "unknown"
	}
	if !r.isTrusted(peer) {
		return peer.String()
	}

	forwardedValues := request.Header.Values("X-Forwarded-For")
	// A conforming ALB appends to one XFF field. Multiple field-lines are
	// ambiguous in net/http (Header.Get returns only the first) and could let a
	// client-controlled value hide the ALB-appended address, so fail safely to
	// the immediate peer instead of guessing.
	if len(forwardedValues) != 1 {
		return peer.String()
	}
	forwarded := forwardedValues[0]
	if len(forwarded) == 0 || len(forwarded) > maxForwardedHeaderBytes {
		return peer.String()
	}
	parts := strings.Split(forwarded, ",")
	if len(parts) > maxForwardedHops {
		return peer.String()
	}
	// Walk toward the client. The first untrusted address from the right is the
	// address observed by the last trusted proxy, even if the client supplied a
	// forged prefix before it.
	for index := len(parts) - 1; index >= 0; index-- {
		candidate := parseIP(strings.TrimSpace(parts[index]))
		if candidate != nil && !r.isTrusted(candidate) {
			return candidate.String()
		}
	}
	return peer.String()
}

func (r IPResolver) isTrusted(ip net.IP) bool {
	for _, network := range r.trusted {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func parseIP(value string) net.IP {
	value = strings.TrimSpace(value)
	if host, _, err := net.SplitHostPort(value); err == nil {
		value = host
	}
	value = strings.Trim(value, "[]")
	return net.ParseIP(value)
}

type Protection struct {
	store    counterStore
	hashKey  []byte
	resolver IPResolver
}

func NewProtection(pool *pgxpool.Pool, jwtSigningKey []byte, trustedProxyCIDRs string) (*Protection, error) {
	if pool == nil {
		return nil, errors.New("abuse protection requires a database pool")
	}
	if len(jwtSigningKey) < 32 {
		return nil, errors.New("abuse protection requires a strong signing key")
	}
	resolver, err := NewIPResolver(trustedProxyCIDRs)
	if err != nil {
		return nil, err
	}
	derived := hmac.New(sha256.New, jwtSigningKey)
	_, _ = derived.Write([]byte("spottr/a06/rate-limit-hmac/v1"))
	return &Protection{
		store:    postgresCounterStore{pool: pool},
		hashKey:  derived.Sum(nil),
		resolver: resolver,
	}, nil
}

func (p *Protection) digest(scope, subject string) []byte {
	hash := hmac.New(sha256.New, p.hashKey)
	_, _ = hash.Write([]byte(scope))
	_, _ = hash.Write([]byte{0})
	_, _ = hash.Write([]byte(subject))
	return hash.Sum(nil)
}

// SubjectDigest returns a domain-separated HMAC suitable for correlating an
// abuse-control subject in application tables without persisting the raw
// value. Callers must use a dedicated scope for each purpose.
func (p *Protection) SubjectDigest(scope, subject string) []byte {
	if p == nil || len(p.hashKey) == 0 || scope == "" || subject == "" {
		return nil
	}
	return p.digest(scope, subject)
}

func (p *Protection) Consume(ctx context.Context, scope, subject string, limit int, window time.Duration) (Decision, error) {
	if p == nil || p.store == nil || scope == "" || subject == "" || limit < 1 || window <= 0 {
		return Decision{}, errors.New("invalid abuse protection configuration")
	}
	storeCtx, cancel := context.WithTimeout(ctx, storeTimeout)
	defer cancel()
	count, windowEnd, err := p.store.consume(storeCtx, scope, p.digest(scope, subject), limit, window)
	if err != nil {
		return Decision{}, err
	}
	if count <= limit {
		return Decision{Allowed: true}, nil
	}
	retryAfter := time.Until(windowEnd)
	if retryAfter < time.Second {
		retryAfter = time.Second
	}
	return Decision{RetryAfter: retryAfter}, nil
}

func (p *Protection) Clear(ctx context.Context, scope, subject string) error {
	if p == nil || p.store == nil || scope == "" || subject == "" {
		return errors.New("invalid abuse protection configuration")
	}
	storeCtx, cancel := context.WithTimeout(ctx, storeTimeout)
	defer cancel()
	return p.store.clear(storeCtx, scope, p.digest(scope, subject))
}

func (p *Protection) ClientIP(request *http.Request) string {
	if p == nil {
		return "unknown"
	}
	return p.resolver.ClientIP(request)
}

// Enforce consumes one attempt and writes a stable fail-closed response when
// the shared limiter is unavailable or the subject exceeded its budget.
func (p *Protection) Enforce(ctx context.Context, w http.ResponseWriter, scope, subject string, limit int, window time.Duration) bool {
	decision, err := p.Consume(ctx, scope, subject, limit, window)
	if err != nil {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Serviciul este temporar indisponibil")
		return false
	}
	if decision.Allowed {
		return true
	}
	seconds := int(math.Ceil(decision.RetryAfter.Seconds()))
	if seconds < 1 {
		seconds = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	router.RespondWithError(w, http.StatusTooManyRequests, "Prea multe incercari. Incearca din nou mai tarziu")
	return false
}

func (p *Protection) Middleware(scope string, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !p.Enforce(r.Context(), w, scope, p.ClientIP(r), limit, window) {
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (p *Protection) StartCleanupWorker(ctx context.Context) {
	if p == nil || p.store == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cleanupCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
				_ = p.store.cleanup(cleanupCtx)
				cancel()
			}
		}
	}()
}
