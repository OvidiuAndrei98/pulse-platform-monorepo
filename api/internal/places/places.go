// Package places exposes only the venue fields needed by the event editor.
// Google credentials stay on the API, and the router restricts both operations
// to authenticated organizers with per-user limits.
package places

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"pulse-api/internal/router"
)

const endpoint = "https://maps.googleapis.com/maps/api/place/"

var sessionPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{16,64}$`)
var placePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,255}$`)

type Handler struct {
	apiKey string
	client *http.Client
}

func NewHandler(apiKey string) *Handler {
	return &Handler{apiKey: apiKey, client: &http.Client{
		Timeout:       8 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

type Prediction struct {
	PlaceID     string `json:"placeId"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type Place struct {
	PlaceID   string  `json:"placeId"`
	Name      string  `json:"name"`
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lng"`
}

func (h *Handler) params(w http.ResponseWriter, r *http.Request) (url.Values, bool) {
	w.Header().Set("Cache-Control", "no-store")
	session := r.URL.Query().Get("session")
	if !sessionPattern.MatchString(session) {
		router.RespondWithError(w, http.StatusBadRequest, "Invalid location search session")
		return nil, false
	}
	if h.apiKey == "" {
		router.RespondWithError(w, http.StatusServiceUnavailable, "Location search is unavailable")
		return nil, false
	}
	language := r.URL.Query().Get("language")
	if language != "ro" {
		language = "en"
	}
	return url.Values{"key": {h.apiKey}, "sessiontoken": {session}, "language": {language}}, true
}

func (h *Handler) Autocomplete(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("q")
	query := strings.TrimSpace(raw)
	if !utf8.ValidString(raw) || utf8.RuneCountInString(query) > 120 || strings.ContainsAny(raw, "\r\n\x00") {
		router.RespondWithError(w, http.StatusBadRequest, "Invalid location query")
		return
	}
	if utf8.RuneCountInString(query) < 2 {
		w.Header().Set("Cache-Control", "no-store")
		router.RespondWithJSON(w, http.StatusOK, []Prediction{})
		return
	}
	params, ok := h.params(w, r)
	if !ok {
		return
	}
	params.Set("input", query)
	params.Set("types", "establishment")
	var payload struct {
		Status      string `json:"status"`
		Predictions []struct {
			PlaceID     string `json:"place_id"`
			Description string `json:"description"`
			Formatting  struct {
				MainText string `json:"main_text"`
			} `json:"structured_formatting"`
		} `json:"predictions"`
	}
	if err := h.get(r.Context(), "autocomplete/json", params, &payload); err != nil || (payload.Status != "OK" && payload.Status != "ZERO_RESULTS") {
		router.RespondWithError(w, http.StatusBadGateway, "Location search is temporarily unavailable")
		return
	}
	predictions := make([]Prediction, 0, 5)
	for _, p := range payload.Predictions {
		if !placePattern.MatchString(p.PlaceID) || p.Description == "" {
			continue
		}
		name := p.Formatting.MainText
		if name == "" {
			name = p.Description
		}
		predictions = append(predictions, Prediction{PlaceID: p.PlaceID, Name: name, Description: p.Description})
		if len(predictions) == 5 {
			break
		}
	}
	router.RespondWithJSON(w, http.StatusOK, predictions)
}

func (h *Handler) Details(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("placeId")
	if !placePattern.MatchString(id) {
		router.RespondWithError(w, http.StatusBadRequest, "Invalid location")
		return
	}
	params, ok := h.params(w, r)
	if !ok {
		return
	}
	params.Set("place_id", id)
	params.Set("fields", "place_id,name,geometry")
	var payload struct {
		Status string `json:"status"`
		Result struct {
			PlaceID  string `json:"place_id"`
			Name     string `json:"name"`
			Geometry struct {
				Location *struct {
					Lat *float64 `json:"lat"`
					Lng *float64 `json:"lng"`
				} `json:"location"`
			} `json:"geometry"`
		} `json:"result"`
	}
	if err := h.get(r.Context(), "details/json", params, &payload); err != nil {
		router.RespondWithError(w, http.StatusBadGateway, "Location details are temporarily unavailable")
		return
	}
	if payload.Status == "NOT_FOUND" || payload.Status == "ZERO_RESULTS" {
		router.RespondWithError(w, http.StatusNotFound, "Location no longer exists")
		return
	}
	location := payload.Result.Geometry.Location
	if payload.Status != "OK" || payload.Result.PlaceID != id || strings.TrimSpace(payload.Result.Name) == "" || location == nil || location.Lat == nil || location.Lng == nil ||
		math.IsNaN(*location.Lat) || math.IsNaN(*location.Lng) || math.Abs(*location.Lat) > 90 || math.Abs(*location.Lng) > 180 {
		router.RespondWithError(w, http.StatusBadGateway, "Invalid location details")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, Place{PlaceID: id, Name: payload.Result.Name, Latitude: *location.Lat, Longitude: *location.Lng})
}

func (h *Handler) get(ctx context.Context, path string, params url.Values, payload any) error {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+path+"?"+params.Encode(), nil)
	if err != nil {
		return err
	}
	response, err := h.client.Do(request)
	if err != nil {
		return errors.New("location provider unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("location provider rejected request")
	}
	// Do not return upstream errors/messages: they can include the server key.
	return json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(payload)
}
