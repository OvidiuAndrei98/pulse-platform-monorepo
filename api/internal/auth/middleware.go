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

type contextKey string

const (
	UserIDKey contextKey = "userID"
	RoleKey   contextKey = "userRole"
)

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

		role, _ := claims["role"].(string)
		if role == "" {
			role = "user" // fallback pentru token-uri emise înainte de role
		}

		ctx := context.WithValue(r.Context(), UserIDKey, userIDStr)
		ctx = context.WithValue(ctx, RoleKey, role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func OptionalAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			next.ServeHTTP(w, r)
			return
		}

		AuthMiddleware(next).ServeHTTP(w, r)
	})
}

func GetUserIDFromContext(ctx context.Context) (string, error) {
	userID, ok := ctx.Value(UserIDKey).(string)
	if !ok {
		return "", fmt.Errorf("user ID lipseste din context")
	}
	return userID, nil
}

// GetRoleFromContext extrage rolul utilizatorului din contextul cererii.
func GetRoleFromContext(ctx context.Context) (string, error) {
	role, ok := ctx.Value(RoleKey).(string)
	if !ok || role == "" {
		return "", fmt.Errorf("role lipseste din context")
	}
	return role, nil
}

// RequireRole returnează middleware care permite accesul doar rolurilor specificate.
// Trebuie folosit DUPĂ AuthMiddleware.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, err := GetRoleFromContext(r.Context())
			if err != nil {
				router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
				return
			}
			for _, allowed := range roles {
				if role == allowed {
					next.ServeHTTP(w, r)
					return
				}
			}
			router.RespondWithError(w, http.StatusForbidden, "Acces interzis - rol insuficient")
		})
	}
}
