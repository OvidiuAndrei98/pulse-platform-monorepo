package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/router"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const googleStateCookie = "pulse_google_oauth_state"

type GoogleOAuthConfig struct {
	ClientID     string
	ClientSecret string
	PublicAPIURL string
	PublicAppURL string
}

type googleTokenResponse struct {
	AccessToken string `json:"access_token"`
}

type googleProfile struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
}

func (h *Handler) ConfigureGoogleOAuth(config GoogleOAuthConfig) {
	h.googleOAuth = config
}

func (h *Handler) HandleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	if !h.googleOAuthConfigured() {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Autentificarea cu Google nu este configurata")
		return
	}

	state, err := randomURLToken(24)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut porni autentificarea Google")
		return
	}
	returnTo := safeReturnTo(r.URL.Query().Get("returnTo"))
	encodedReturnTo := base64.RawURLEncoding.EncodeToString([]byte(returnTo))

	http.SetCookie(w, &http.Cookie{
		Name:     googleStateCookie,
		Value:    state,
		Path:     "/api/v1/auth/google/callback",
		MaxAge:   600,
		HttpOnly: true,
		Secure:   strings.HasPrefix(h.googleOAuth.PublicAPIURL, "https://"),
		SameSite: http.SameSiteLaxMode,
	})

	authorizeURL, _ := url.Parse("https://accounts.google.com/o/oauth2/v2/auth")
	query := authorizeURL.Query()
	query.Set("client_id", h.googleOAuth.ClientID)
	query.Set("redirect_uri", h.googleRedirectURI())
	query.Set("response_type", "code")
	query.Set("scope", "openid email profile")
	query.Set("state", state+"."+encodedReturnTo)
	query.Set("prompt", "select_account")
	authorizeURL.RawQuery = query.Encode()
	http.Redirect(w, r, authorizeURL.String(), http.StatusFound)
}

func (h *Handler) HandleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	if !h.googleOAuthConfigured() {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Autentificarea cu Google nu este configurata")
		return
	}

	stateParts := strings.SplitN(r.URL.Query().Get("state"), ".", 2)
	stateCookie, err := r.Cookie(googleStateCookie)
	if err != nil || len(stateParts) != 2 || stateParts[0] == "" || stateCookie.Value != stateParts[0] {
		router.RespondWithError(w, http.StatusBadRequest, "Sesiunea de autentificare Google a expirat")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: googleStateCookie, Value: "", Path: "/api/v1/auth/google/callback", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})

	returnToBytes, err := base64.RawURLEncoding.DecodeString(stateParts[1])
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Destinatia de autentificare este invalida")
		return
	}
	returnTo := safeReturnTo(string(returnToBytes))
	code := r.URL.Query().Get("code")
	if code == "" {
		router.RespondWithError(w, http.StatusBadRequest, "Google nu a returnat un cod de autentificare")
		return
	}

	profile, err := h.fetchGoogleProfile(r, code)
	if err != nil {
		router.RespondWithError(w, http.StatusUnauthorized, "Autentificarea cu Google nu a putut fi validata")
		return
	}
	user, err := h.findOrCreateGoogleUser(r, profile)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Contul Google nu a putut fi asociat")
		return
	}
	h.claimGuestPurchases(r.Context(), user.ID)
	token, err := issueUserJWT(user)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Sesiunea nu a putut fi creata")
		return
	}

	redirectURL := strings.TrimRight(h.googleOAuth.PublicAppURL, "/") + "/auth/google/callback#token=" + url.QueryEscape(token) + "&returnTo=" + url.QueryEscape(returnTo)
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

func (h *Handler) fetchGoogleProfile(r *http.Request, code string) (googleProfile, error) {
	form := url.Values{
		"code":          {code},
		"client_id":     {h.googleOAuth.ClientID},
		"client_secret": {h.googleOAuth.ClientSecret},
		"redirect_uri":  {h.googleRedirectURI()},
		"grant_type":    {"authorization_code"},
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return googleProfile{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return googleProfile{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return googleProfile{}, fmt.Errorf("google token exchange returned %s", response.Status)
	}

	var token googleTokenResponse
	if err := json.NewDecoder(response.Body).Decode(&token); err != nil || token.AccessToken == "" {
		return googleProfile{}, errors.New("google token response is invalid")
	}
	profileRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil)
	if err != nil {
		return googleProfile{}, err
	}
	profileRequest.Header.Set("Authorization", "Bearer "+token.AccessToken)
	profileResponse, err := http.DefaultClient.Do(profileRequest)
	if err != nil {
		return googleProfile{}, err
	}
	defer profileResponse.Body.Close()
	if profileResponse.StatusCode != http.StatusOK {
		return googleProfile{}, fmt.Errorf("google profile request returned %s", profileResponse.Status)
	}

	var profile googleProfile
	if err := json.NewDecoder(profileResponse.Body).Decode(&profile); err != nil || profile.Subject == "" || profile.Email == "" || !profile.EmailVerified {
		return googleProfile{}, errors.New("google profile is incomplete")
	}
	return profile, nil
}

func (h *Handler) findOrCreateGoogleUser(r *http.Request, profile googleProfile) (db.Users, error) {
	googleID := pgtype.Text{String: profile.Subject, Valid: true}
	user, err := h.Queries.GetUserByGoogleID(r.Context(), googleID)
	if err == nil {
		return h.Queries.LinkGoogleIdentity(r.Context(), db.LinkGoogleIdentityParams{
			ID:        user.ID,
			GoogleID:  googleID,
			AvatarUrl: profile.Picture,
		})
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.Users{}, err
	}

	user, err = h.Queries.GetUserByEmail(r.Context(), strings.ToLower(profile.Email))
	if err == nil {
		return h.Queries.LinkGoogleIdentity(r.Context(), db.LinkGoogleIdentityParams{
			ID:        user.ID,
			GoogleID:  googleID,
			AvatarUrl: profile.Picture,
		})
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.Users{}, err
	}

	username := googleUsername(profile)
	return h.Queries.CreateUser(r.Context(), db.CreateUserParams{
		Username:  username,
		Email:     strings.ToLower(profile.Email),
		AvatarUrl: pgtype.Text{String: profile.Picture, Valid: profile.Picture != ""},
		Role:      pgtype.Text{String: "user", Valid: true},
		IsActive:  pgtype.Bool{Bool: true, Valid: true},
		GoogleID:  googleID,
	})
}

func (h *Handler) googleRedirectURI() string {
	return strings.TrimRight(h.googleOAuth.PublicAPIURL, "/") + "/api/v1/auth/google/callback"
}

func (h *Handler) googleOAuthConfigured() bool {
	return h.googleOAuth.ClientID != "" && h.googleOAuth.ClientSecret != "" && h.googleOAuth.PublicAPIURL != "" && h.googleOAuth.PublicAppURL != ""
}

func randomURLToken(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func safeReturnTo(value string) string {
	if !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") {
		return "/users/me"
	}
	return value
}

func googleUsername(profile googleProfile) string {
	base := strings.ToLower(strings.Split(profile.Email, "@")[0])
	base = strings.Map(func(char rune) rune {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || char == '_' {
			return char
		}
		return '_'
	}, base)
	if len(base) < 3 {
		base = "pulse_user"
	}
	if len(base) > 40 {
		base = base[:40]
	}
	suffix := profile.Subject
	if len(suffix) > 8 {
		suffix = suffix[len(suffix)-8:]
	}
	return base + "_" + suffix
}
