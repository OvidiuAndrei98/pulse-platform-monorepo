package router

import "net/http"

// Bound expensive work before allocating bodies or borrowing DB connections.
// Never queue unbounded requests in memory; clients can retry with jitter.
func concurrentRequests(limit int) func(http.Handler) http.Handler {
	slots := make(chan struct{}, limit)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
				next.ServeHTTP(w, r)
			default:
				w.Header().Set("Retry-After", "2")
				RespondWithError(w, http.StatusTooManyRequests, "Serviciul este ocupat. Reincearca in cateva secunde.")
			}
		})
	}
}
