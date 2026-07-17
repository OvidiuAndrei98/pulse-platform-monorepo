package auth

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"

	"pulse-api/internal/router"

	"github.com/golang-jwt/jwt/v5"
)

// Definim tipul neexportat și constanta la nivel de pachet
type contextKey string

const UserIDKey contextKey = "userID"

// AuthMiddleware validează token-ul JWT din header-ul Authorization
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			router.RespondWithError(w, http.StatusUnauthorized, "Lipseste header-ul de autentificare")
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			router.RespondWithError(w, http.StatusUnauthorized, "Format invalid pentru Authorization (trebuie sa fie 'Bearer <token>')")
			return
		}

		tokenString := parts[1]

		jwtSecret := []byte(os.Getenv("JWT_SECRET"))

		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("algoritm de semnare neasteptat: %v", t.Header["alg"])
			}
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			router.RespondWithError(w, http.StatusUnauthorized, "Token invalid sau expirat")
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			router.RespondWithError(w, http.StatusUnauthorized, "Token-ul nu contine informatii valide")
			return
		}

		userIDStr, ok := claims["sub"].(string)
		if !ok {
			router.RespondWithError(w, http.StatusUnauthorized, "Token-ul nu contine ID-ul utilizatorului")
			return
		}

		// Folosim constanta pentru a salva în siguranță ID-ul în context
		ctx := context.WithValue(r.Context(), UserIDKey, userIDStr)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserIDFromContext este utilitarul pe care îl vei folosi în endpoint-urile protejate
func GetUserIDFromContext(ctx context.Context) (string, error) {
	userID, ok := ctx.Value(UserIDKey).(string)
	if !ok {
		return "", fmt.Errorf("user ID lipseste din context")
	}
	return userID, nil
}
