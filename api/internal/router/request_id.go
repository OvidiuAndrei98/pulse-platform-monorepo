package router

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
)

// Always replace caller-controlled IDs. The opaque value is shared by response,
// request context and chi logs; it contains neither hostnames nor account data.
func requestCorrelation(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var value [16]byte
		if _, err := rand.Read(value[:]); err != nil {
			// Correlation is optional; never block the application or invent a weak ID.
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), middleware.RequestIDKey, "")))
			return
		}
		value[6] = (value[6] & 0x0f) | 0x40
		value[8] = (value[8] & 0x3f) | 0x80
		id := fmt.Sprintf("%x-%x-%x-%x-%x", value[:4], value[4:6], value[6:8], value[8:10], value[10:])
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), middleware.RequestIDKey, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
