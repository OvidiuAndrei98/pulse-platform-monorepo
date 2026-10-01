package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"pulse-api/internal/router"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const (
	UserIDKey          contextKey = "userID"
	RoleKey            contextKey = "userRole"
	IssuedAtKey        contextKey = "sessionIssuedAt"
	ScannerAccessIDKey contextKey = "scannerAccessID"
	ScannerEventIDKey  contextKey = "scannerEventID"
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

		token, err := parseSession(tokenString)

		if err != nil || !token.Valid {
			router.RespondWithError(w, http.StatusUnauthorized, "Token invalid sau expirat")
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			router.RespondWithError(w, http.StatusUnauthorized, "Token-ul nu contine informatii valide")
			return
		}
		if scope, _ := claims["scope"].(string); scope == "scanner" {
			router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea de scanare nu poate accesa acest endpoint")
			return
		}

		userIDStr, ok := claims["sub"].(string)
		if !ok || userIDStr == "" {
			router.RespondWithError(w, http.StatusUnauthorized, "Token-ul nu contine ID-ul utilizatorului")
			return
		}

		role, _ := claims["role"].(string)
		if role == "" {
			role = "user" // fallback pentru token-uri emise înainte de role
		}

		ctx := context.WithValue(r.Context(), UserIDKey, userIDStr)
		ctx = context.WithValue(ctx, RoleKey, role)
		if issuedAt, issuedAtErr := claims.GetIssuedAt(); issuedAtErr == nil && issuedAt != nil {
			ctx = context.WithValue(ctx, IssuedAtKey, issuedAt.Time)
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ScannerAuthMiddleware accepta doar sesiunile temporare generate pentru un link de poarta.
// Ele nu contin un utilizator Glow si nu pot fi folosite cu AuthMiddleware.
func ScannerAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea de scanare lipseste sau este invalida")
			return
		}

		token, err := parseSession(parts[1])
		if err != nil || !token.Valid {
			router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea de scanare este expirata sau invalida")
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["scope"] != "scanner" {
			router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea nu are acces de scanare")
			return
		}
		accessID, accessOK := claims["scanner_access_id"].(string)
		eventID, eventOK := claims["event_id"].(string)
		if !accessOK || !eventOK || accessID == "" || eventID == "" {
			router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea de scanare este incompleta")
			return
		}

		ctx := context.WithValue(r.Context(), ScannerAccessIDKey, accessID)
		ctx = context.WithValue(ctx, ScannerEventIDKey, eventID)
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

func GetIssuedAtFromContext(ctx context.Context) (time.Time, error) {
	issuedAt, ok := ctx.Value(IssuedAtKey).(time.Time)
	if !ok || issuedAt.IsZero() {
		return time.Time{}, fmt.Errorf("session issue time lipseste din context")
	}
	return issuedAt, nil
}

func GetScannerAccessIDFromContext(ctx context.Context) (string, error) {
	accessID, ok := ctx.Value(ScannerAccessIDKey).(string)
	if !ok || accessID == "" {
		return "", fmt.Errorf("scanner access ID lipseste din context")
	}
	return accessID, nil
}

func GetScannerEventIDFromContext(ctx context.Context) (string, error) {
	eventID, ok := ctx.Value(ScannerEventIDKey).(string)
	if !ok || eventID == "" {
		return "", fmt.Errorf("scanner event ID lipseste din context")
	}
	return eventID, nil
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
