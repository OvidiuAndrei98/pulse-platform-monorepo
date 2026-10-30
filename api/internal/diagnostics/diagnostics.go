package diagnostics

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"pulse-api/internal/router"
)

type Frame struct {
	File     string `json:"file"`
	Function string `json:"function"`
	Line     int    `json:"line"`
	Column   int    `json:"column"`
}
type Report struct {
	ID           string    `json:"id"`
	OccurredAt   time.Time `json:"occurredAt"`
	Platform     string    `json:"platform"`
	AppVersion   string    `json:"appVersion"`
	BuildVersion string    `json:"buildVersion"`
	OSVersion    string    `json:"osVersion"`
	ErrorType    string    `json:"errorType"`
	Category     string    `json:"category"`
	Fatal        bool      `json:"fatal"`
	Screen       string    `json:"screen"`
	Breadcrumbs  []string  `json:"breadcrumbs"`
	Frames       []Frame   `json:"frames"`
	Operation    string    `json:"operation,omitempty"`
	Failure      string    `json:"failure,omitempty"`
	HTTPStatus   int       `json:"httpStatus,omitempty"`
	ErrorCode    string    `json:"errorCode,omitempty"`
	SafeMessage  string    `json:"safeMessage,omitempty"`
	ErrorSource  string    `json:"errorSource,omitempty"`
	Endpoint     string    `json:"endpoint,omitempty"`
	HTTPMethod   string    `json:"httpMethod,omitempty"`
	RequestID    string    `json:"requestId,omitempty"`
}
type Entry struct {
	Report
	ReceivedAt  time.Time `json:"receivedAt"`
	Fingerprint string    `json:"fingerprint"`
}
type Cursor struct {
	Time time.Time `json:"time"`
	ID   string    `json:"id"`
}
type Store interface {
	Save(context.Context, Report, string) error
	List(context.Context, string, *Cursor) ([]Entry, error)
	Cleanup(context.Context) error
}
type Handler struct {
	Store Store
	Now   func() time.Time
}

var uuid = regexp.MustCompile(`(?i)^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
var requestID = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`)
var version = regexp.MustCompile(`^(unknown|[0-9][0-9A-Za-z.+_-]{0,39})$`)
var symbol = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_.$<> -]{0,79}$`)
var filename = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,80}\.(js|jsx|ts|tsx|bundle|jsbundle|hbc)$`)
var secret = regexp.MustCompile(`(?i)(secret|bearer|sk_|pk_|rk_|cs_|pi_|eyJ|[a-f0-9]{24})`)

func oneOf(value, options string) bool {
	return strings.Contains("|"+options+"|", "|"+value+"|") && value != "" && !strings.Contains(value, "|")
}
func Screen(value string) bool {
	return oneOf(value, "Unknown|Home|Explore|Feed|Profile|Tabs|FeedHome|FriendsManage|ProfileHome|SavedEvents|Tickets|Orders|Event|EventDetails|Search|PublicProfile|Legal|SafetyGroup|Dashboard|Scanner|Admin|QuickScanner|Checkout|CheckoutReturn|Auth")
}
func (r Report) valid(now time.Time) bool {
	if !uuid.MatchString(r.ID) || r.OccurredAt.Before(now.Add(-7*24*time.Hour)) || r.OccurredAt.After(now.Add(5*time.Minute)) || !oneOf(r.Platform, "ios|android|web") || !version.MatchString(r.AppVersion) || !version.MatchString(r.BuildVersion) || !version.MatchString(r.OSVersion) {
		return false
	}
	if !r.validContext() || !oneOf(r.ErrorType, "Error|TypeError|ReferenceError|RangeError|SyntaxError|InvariantViolation|Unknown") || !oneOf(r.Category, "property_access|undefined_identifier|invalid_hook|render_exception|network|timeout|unknown") || !Screen(r.Screen) || len(r.Breadcrumbs) > 8 || len(r.Frames) > 12 {
		return false
	}
	if r.Operation != "" || r.Failure != "" || r.HTTPStatus != 0 {
		if !oneOf(r.Operation, "api_request|tickets_load|tickets_storage|orders_load|payment_prepare|payment_confirm|payment_present|payment_storage|payment_ticket_delivery|scanner_events|scanner_prepare|scanner_validate|scanner_sync|scanner_storage") || !oneOf(r.Failure, "server_error|invalid_response|storage_error|sdk_error|configuration|fulfillment_missing") || (r.HTTPStatus != 0 && (r.HTTPStatus < 500 || r.HTTPStatus > 599)) {
			return false
		}
	}
	for _, s := range r.Breadcrumbs {
		if !Screen(s) {
			return false
		}
	}
	for _, f := range r.Frames {
		if (f.File != "unknown" && !filename.MatchString(f.File)) || (f.Function != "anonymous" && !symbol.MatchString(f.Function)) || secret.MatchString(f.File) || secret.MatchString(f.Function) || f.Line < 0 || f.Line > 100000000 || f.Column < 0 || f.Column > 100000000 {
			return false
		}
	}
	return true
}
func fingerprint(r Report) string {
	// Exclude timestamps/report IDs so repeated occurrences can be correlated.
	data, _ := json.Marshal([]any{r.Platform, r.AppVersion, r.BuildVersion, r.ErrorType, r.Category, r.Screen, r.Frames})
	if r.Operation != "" {
		// Retries of one handled failure may have different JavaScript call sites.
		data, _ = json.Marshal([]any{r.Platform, r.AppVersion, r.BuildVersion, r.Screen, r.Operation, r.Failure, r.HTTPStatus})
	}
	if r.ErrorCode != "" {
		data, _ = json.Marshal([]any{string(data), r.ErrorCode, r.ErrorSource, r.Endpoint, r.HTTPMethod})
	}
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}
func (h *Handler) Ingest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	r.Body = http.MaxBytesReader(w, r.Body, 12288)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var report Report
	if err := decoder.Decode(&report); err != nil {
		router.RespondWithError(w, 400, "Invalid diagnostic report")
		return
	}
	var extra any
	now := time.Now()
	if h.Now != nil {
		now = h.Now()
	}
	if decoder.Decode(&extra) != io.EOF || !report.valid(now) {
		router.RespondWithError(w, 400, "Invalid diagnostic report")
		return
	}
	if report.Breadcrumbs == nil {
		report.Breadcrumbs = []string{}
	}
	if report.Frames == nil {
		report.Frames = []Frame{}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if h.Store.Save(ctx, report, fingerprint(report)) != nil {
		router.RespondWithError(w, 503, "Diagnostics unavailable")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func parseCursor(raw string) (*Cursor, error) {
	if raw == "" {
		return nil, nil
	}
	if len(raw) > 256 {
		return nil, errors.New("invalid cursor")
	}
	data, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return nil, err
	}
	var c Cursor
	if json.Unmarshal(data, &c) != nil || c.Time.IsZero() || !uuid.MatchString(c.ID) {
		return nil, errors.New("invalid cursor")
	}
	return &c, nil
}
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	platform := r.URL.Query().Get("platform")
	cursor, err := parseCursor(r.URL.Query().Get("cursor"))
	if err != nil || platform != "" && !oneOf(platform, "ios|android|web") {
		router.RespondWithError(w, 400, "Invalid diagnostics filter")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	rows, err := h.Store.List(ctx, platform, cursor)
	if err != nil {
		router.RespondWithError(w, 503, "Diagnostics unavailable")
		return
	}
	next := ""
	if len(rows) > 25 {
		rows = rows[:25]
		last := rows[24]
		data, _ := json.Marshal(Cursor{Time: last.ReceivedAt, ID: last.ID})
		next = base64.RawURLEncoding.EncodeToString(data)
	}
	if rows == nil {
		rows = []Entry{}
	}
	router.RespondWithJSON(w, 200, struct {
		Items      []Entry `json:"items"`
		NextCursor string  `json:"nextCursor"`
	}{rows, next})
}

func (h *Handler) StartCleanupWorker(ctx context.Context) {
	go func() {
		cleanup := func() {
			job, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			if err := h.Store.Cleanup(job); err != nil && ctx.Err() == nil {
				log.Print("diagnostics retention cleanup failed; retrying on the next interval")
			}
		}
		cleanup()
		timer := time.NewTicker(5 * time.Minute)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				cleanup()
			}
		}
	}()
}
