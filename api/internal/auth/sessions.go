package auth

import (
	"context"
	"errors"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "pulse-api/db/generated"
	"pulse-api/internal/router"
)

const sessionVersionKey contextKey = "sessionVersion"

type userSessionState struct {
	passwordHash pgtype.Text
	googleID     pgtype.Text
	role         pgtype.Text
	active       pgtype.Bool
	version      int64
}

func (h *Handler) loadUserSessionState(ctx context.Context, id pgtype.UUID) (userSessionState, error) {
	var state userSessionState
	if h.Pool == nil {
		return state, errors.New("session database is unavailable")
	}
	err := h.Pool.QueryRow(ctx, `
		SELECT u.password_hash, u.google_id, u.role, u.is_active, s.version
		FROM users u JOIN user_session_versions s ON s.user_id = u.id
		WHERE u.id = $1`, id).Scan(&state.passwordHash, &state.googleID, &state.role, &state.active, &state.version)
	return state, err
}

func (s userSessionState) valid() bool {
	return s.version > 0 && s.active.Valid && s.active.Bool && s.role.Valid &&
		(s.role.String == "user" || s.role.String == "organizer" || s.role.String == "admin")
}

// Bind the version to the same credentials checked by login. Reading a newer
// version after an overlapping password reset must not authorize the old password.
func (h *Handler) issueUserSession(ctx context.Context, user db.Users) (string, error) {
	state, err := h.loadUserSessionState(ctx, user.ID)
	if err != nil {
		return "", err
	}
	if !state.valid() || state.passwordHash != user.PasswordHash || state.googleID != user.GoogleID ||
		state.role != user.Role || state.active != user.IsActive {
		return "", errors.New("account credentials changed during sign-in; sign in again")
	}
	return issueUserJWT(user, state.version)
}

// AuthMiddleware validates both the JWT and the current account state. Do not
// cache this read: password reset, deactivation and role changes revoke access
// on the next request, including requests handled by another API task.
func (h *Handler) AuthMiddleware(next http.Handler) http.Handler {
	return sessionAuthMiddleware(h.loadUserSessionState)(next)
}

func (h *Handler) OptionalAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") == "" {
			next.ServeHTTP(w, r)
			return
		}
		h.AuthMiddleware(next).ServeHTTP(w, r)
	})
}

func sessionAuthMiddleware(lookup func(context.Context, pgtype.UUID) (userSessionState, error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			idString, _ := GetUserIDFromContext(r.Context())
			var id pgtype.UUID
			versionString, _ := r.Context().Value(sessionVersionKey).(string)
			version, err := strconv.ParseInt(versionString, 10, 64)
			if err != nil || version <= 0 || id.Scan(idString) != nil || !id.Valid {
				router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea a expirat. Autentifica-te din nou.")
				return
			}
			state, err := lookup(r.Context(), id)
			if errors.Is(err, pgx.ErrNoRows) || (err == nil && (!state.valid() || state.version != version)) {
				router.RespondWithError(w, http.StatusUnauthorized, "Sesiunea a expirat. Autentifica-te din nou.")
				return
			}
			if err != nil {
				router.RespondWithError(w, http.StatusServiceUnavailable, "Autentificarea nu poate fi verificata momentan.")
				return
			}
			ctx := context.WithValue(r.Context(), RoleKey, state.role.String)
			next.ServeHTTP(w, r.WithContext(ctx))
		}))
	}
}
