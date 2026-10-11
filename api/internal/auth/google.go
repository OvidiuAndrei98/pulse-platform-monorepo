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
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	googleStateCookie                 = "pulse_google_oauth_state"
	googleOrganizerRegistrationCookie = "spottr_google_organizer_registration"
)

type GoogleOAuthConfig struct {
	ClientID        string
	ClientSecret    string
	PublicAPIURL    string
	PublicAppURL    string
	MobileAppScheme string
}

type googleOAuthState struct {
	ReturnTo      string `json:"returnTo"`
	Mobile        bool   `json:"mobile"`
	AccountType   string `json:"accountType"`
	Native        bool   `json:"native,omitempty"`
	ClientNonce   string `json:"clientNonce,omitempty"`
	PreviewOrigin string `json:"previewOrigin,omitempty"`
}

type googleOrganizerRegistration struct {
	Cui         string `json:"cui"`
	CompanyName string `json:"companyName"`
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

	accountType := googleAccountType(r.URL.Query().Get("accountType"))
	if accountType == "organizer" {
		cui, companyName, detailErr := common.NormalizeOrganizerDetails(
			r.URL.Query().Get("cui"),
			r.URL.Query().Get("companyName"),
		)
		if detailErr != nil {
			router.RespondWithError(w, http.StatusBadRequest, detailErr.Error())
			return
		}
		registration, marshalErr := json.Marshal(googleOrganizerRegistration{Cui: cui, CompanyName: companyName})
		if marshalErr != nil {
			router.RespondWithError(w, http.StatusInternalServerError, "Datele firmei nu au putut fi pregatite")
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name:     googleOrganizerRegistrationCookie,
			Value:    base64.RawURLEncoding.EncodeToString(registration),
			Path:     "/api/v1/auth/google/callback",
			MaxAge:   600,
			HttpOnly: true,
			Secure:   strings.HasPrefix(h.googleOAuth.PublicAPIURL, "https://"),
			SameSite: http.SameSiteLaxMode,
		})
	}

	state, err := randomURLToken(24)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut porni autentificarea Google")
		return
	}
	returnTo := safeReturnTo(r.URL.Query().Get("returnTo"))
	nativeClient := r.URL.Query().Get("client") == "native"
	clientNonce := r.URL.Query().Get("clientNonce")
	if nativeClient && (len(clientNonce) < 32 || len(clientNonce) > 128) {
		router.RespondWithError(w, http.StatusBadRequest, "Sesiunea de autentificare este invalida")
		return
	}
	statePayload, err := json.Marshal(googleOAuthState{
		ReturnTo:      returnTo,
		Mobile:        r.URL.Query().Get("client") == "mobile",
		AccountType:   accountType,
		Native:        nativeClient,
		ClientNonce:   clientNonce,
		PreviewOrigin: nativePreviewOrigin(r.URL.Query().Get("previewOrigin")),
	})
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut porni autentificarea Google")
		return
	}
	encodedState := base64.RawURLEncoding.EncodeToString(statePayload)

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
	query.Set("state", state+"."+encodedState)
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

	stateBytes, err := base64.RawURLEncoding.DecodeString(stateParts[1])
	if err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Destinatia de autentificare este invalida")
		return
	}
	var oauthState googleOAuthState
	if err := json.Unmarshal(stateBytes, &oauthState); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Destinatia de autentificare este invalida")
		return
	}
	returnTo := safeReturnTo(oauthState.ReturnTo)
	var organizerRegistration googleOrganizerRegistration
	if googleAccountType(oauthState.AccountType) == "organizer" {
		registrationCookie, cookieErr := r.Cookie(googleOrganizerRegistrationCookie)
		if cookieErr != nil {
			router.RespondWithError(w, http.StatusBadRequest, "Datele firmei au expirat. Porneste din nou inregistrarea")
			return
		}
		http.SetCookie(w, &http.Cookie{Name: googleOrganizerRegistrationCookie, Value: "", Path: "/api/v1/auth/google/callback", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
		registrationBytes, decodeErr := base64.RawURLEncoding.DecodeString(registrationCookie.Value)
		if decodeErr != nil || json.Unmarshal(registrationBytes, &organizerRegistration) != nil {
			router.RespondWithError(w, http.StatusBadRequest, "Datele firmei sunt invalide")
			return
		}
		organizerRegistration.Cui, organizerRegistration.CompanyName, err = common.NormalizeOrganizerDetails(
			organizerRegistration.Cui,
			organizerRegistration.CompanyName,
		)
		if err != nil {
			router.RespondWithError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
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
	user, err := h.findOrCreateGoogleUser(r, profile, googleAccountType(oauthState.AccountType))
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Contul Google nu a putut fi asociat")
		return
	}
	if googleAccountType(oauthState.AccountType) == "organizer" {
		if err := h.Queries.CreatePendingOrganizerProfile(r.Context(), db.CreatePendingOrganizerProfileParams{
			UserID:      user.ID,
			Cui:         organizerRegistration.Cui,
			CompanyName: organizerRegistration.CompanyName,
		}); err != nil {
			router.RespondWithError(w, http.StatusConflict, "CUI-ul este deja asociat unui alt cont de organizator")
			return
		}
	}
	h.claimGuestPurchases(r.Context(), user.ID)
	token, err := issueUserJWT(user)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Sesiunea nu a putut fi creata")
		return
	}

	oauthState.ReturnTo = returnTo
	http.Redirect(w, r, googleCallbackURL(h.googleOAuth, oauthState, token), http.StatusFound)
}

func googleCallbackURL(config GoogleOAuthConfig, state googleOAuthState, token string) string {
	base := strings.TrimRight(config.PublicAppURL, "/") + "/auth/google/callback"
	if state.Mobile {
		base = normalizedMobileAppScheme(config.MobileAppScheme) + "://auth/google/callback"
	}
	values := url.Values{"token": {token}, "returnTo": {safeReturnTo(state.ReturnTo)}}
	if state.Native {
		base = "spottr-native://auth/google/callback"
		if origin := nativePreviewOrigin(state.PreviewOrigin); origin != "" {
			base = origin + "/auth/google/callback"
		}
		values.Set("clientNonce", state.ClientNonce)
	}
	return base + "#" + values.Encode()
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

func (h *Handler) findOrCreateGoogleUser(r *http.Request, profile googleProfile, accountType string) (db.Users, error) {
	googleID := pgtype.Text{String: profile.Subject, Valid: true}
	user, err := h.Queries.GetUserByGoogleID(r.Context(), googleID)
	if err == nil {
		linkedUser, linkErr := h.Queries.LinkGoogleIdentity(r.Context(), db.LinkGoogleIdentityParams{
			ID:        user.ID,
			GoogleID:  googleID,
			AvatarUrl: profile.Picture,
		})
		if linkErr != nil {
			return db.Users{}, linkErr
		}
		return h.applyGoogleAccountType(r.Context(), linkedUser, accountType)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.Users{}, err
	}

	user, err = h.Queries.GetUserByEmail(r.Context(), strings.ToLower(profile.Email))
	if err == nil {
		linkedUser, linkErr := h.Queries.LinkGoogleIdentity(r.Context(), db.LinkGoogleIdentityParams{
			ID:        user.ID,
			GoogleID:  googleID,
			AvatarUrl: profile.Picture,
		})
		if linkErr != nil {
			return db.Users{}, linkErr
		}
		return h.applyGoogleAccountType(r.Context(), linkedUser, accountType)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return db.Users{}, err
	}

	username := googleUsername(profile)
	return h.Queries.CreateUser(r.Context(), db.CreateUserParams{
		Username:  username,
		Email:     strings.ToLower(profile.Email),
		AvatarUrl: pgtype.Text{String: profile.Picture, Valid: profile.Picture != ""},
		Role:      pgtype.Text{String: accountType, Valid: true},
		IsActive:  pgtype.Bool{Bool: true, Valid: true},
		GoogleID:  googleID,
	})
}

func googleAccountType(value string) string {
	if value == "organizer" {
		return "organizer"
	}
	return "user"
}

// Local Expo preview only. Never accept an arbitrary OAuth redirect origin.
func nativePreviewOrigin(value string) string {
	if value == "http://localhost:8081" || value == "http://127.0.0.1:8081" {
		return value
	}
	return ""
}

func (h *Handler) applyGoogleAccountType(ctx context.Context, user db.Users, accountType string) (db.Users, error) {
	if accountType != "organizer" || user.Role.String != "user" {
		return user, nil
	}
	return h.Queries.PromoteUserToOrganizer(ctx, user.ID)
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

func normalizedMobileAppScheme(value string) string {
	scheme := strings.ToLower(strings.TrimSpace(value))
	if separator := strings.Index(scheme, ":"); separator >= 0 {
		scheme = scheme[:separator]
	}
	if scheme == "" {
		return "glow"
	}
	for _, character := range scheme {
		if (character >= 'a' && character <= 'z') ||
			(character >= '0' && character <= '9') ||
			character == '+' || character == '-' || character == '.' {
			continue
		}
		return "glow"
	}
	return scheme
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
