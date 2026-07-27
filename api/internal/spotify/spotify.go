package spotify

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"pulse-api/internal/router"
)

const (
	accountsURL = "https://accounts.spotify.com/api/token"
	searchURL   = "https://api.spotify.com/v1/search"
)

type Handler struct {
	clientID     string
	clientSecret string
	httpClient   *http.Client

	mu        sync.Mutex
	token     string
	expiresAt time.Time
}

type Artist struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	ImageURL   string   `json:"imageUrl"`
	Genres     []string `json:"genres"`
	SpotifyURL string   `json:"spotifyUrl"`
}

func NewHandler(clientID, clientSecret string) *Handler {
	return &Handler{
		clientID:     clientID,
		clientSecret: clientSecret,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) < 2 {
		router.RespondWithJSON(w, http.StatusOK, []Artist{})
		return
	}
	if h.clientID == "" || h.clientSecret == "" {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Cautarea Spotify nu este configurata")
		return
	}

	token, err := h.accessToken(r.Context())
	if err != nil {
		router.RespondWithError(w, http.StatusBadGateway, "Spotify nu este disponibil momentan")
		return
	}

	endpoint, _ := url.Parse(searchURL)
	params := endpoint.Query()
	params.Set("type", "artist")
	params.Set("q", query)
	params.Set("limit", "5")
	endpoint.RawQuery = params.Encode()

	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, endpoint.String(), nil)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Nu s-a putut pregati cautarea Spotify")
		return
	}
	request.Header.Set("Authorization", "Bearer "+token)

	response, err := h.httpClient.Do(request)
	if err != nil {
		router.RespondWithError(w, http.StatusBadGateway, "Spotify nu este disponibil momentan")
		return
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		router.RespondWithError(w, http.StatusBadGateway, "Spotify nu a putut procesa cautarea")
		return
	}

	var payload struct {
		Artists struct {
			Items []struct {
				ID     string   `json:"id"`
				Name   string   `json:"name"`
				Genres []string `json:"genres"`
				Images []struct {
					URL string `json:"url"`
				} `json:"images"`
				ExternalURLs struct {
					Spotify string `json:"spotify"`
				} `json:"external_urls"`
			} `json:"items"`
		} `json:"artists"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err != nil {
		router.RespondWithError(w, http.StatusBadGateway, "Raspuns Spotify invalid")
		return
	}

	artists := make([]Artist, 0, len(payload.Artists.Items))
	for _, item := range payload.Artists.Items {
		imageURL := ""
		if len(item.Images) > 0 {
			imageURL = item.Images[0].URL
		}
		artists = append(artists, Artist{
			ID:         item.ID,
			Name:       item.Name,
			ImageURL:   imageURL,
			Genres:     item.Genres,
			SpotifyURL: item.ExternalURLs.Spotify,
		})
	}

	router.RespondWithJSON(w, http.StatusOK, artists)
}

func (h *Handler) accessToken(ctx context.Context) (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.token != "" && h.expiresAt.After(time.Now().Add(30*time.Second)) {
		return h.token, nil
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, accountsURL, strings.NewReader("grant_type=client_credentials"))
	if err != nil {
		return "", err
	}
	credentials := base64.StdEncoding.EncodeToString([]byte(h.clientID + ":" + h.clientSecret))
	request.Header.Set("Authorization", "Basic "+credentials)
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	response, err := h.httpClient.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", &spotifyError{status: response.StatusCode}
	}

	var tokenResponse struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&tokenResponse); err != nil {
		return "", err
	}
	h.token = tokenResponse.AccessToken
	h.expiresAt = time.Now().Add(time.Duration(tokenResponse.ExpiresIn) * time.Second)
	return h.token, nil
}

type spotifyError struct{ status int }

func (e *spotifyError) Error() string { return "spotify returned an unexpected status" }
