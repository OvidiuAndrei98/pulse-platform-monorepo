package organizer

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type DirectorySearch struct {
	Search string `json:"search"`
	Status string `json:"status"`
	After  string `json:"after"`
}
type DirectoryItem struct {
	UserID             string `json:"userId"`
	CompanyName        string `json:"companyName"`
	CUI                string `json:"cui"`
	Username           string `json:"username"`
	Email              string `json:"email"`
	VerificationStatus string `json:"verificationStatus"`
	AccountActive      bool   `json:"accountActive"`
	StripeStatus       string `json:"stripeStatus"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}
type DirectoryPage struct {
	Items      []DirectoryItem `json:"items"`
	NextCursor string          `json:"nextCursor"`
}
type DirectoryEvent struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	StartTime string `json:"startTime"`
	Status    string `json:"status"`
	Location  string `json:"location"`
}
type DirectoryDetail struct {
	DirectoryItem
	FiscalAddress           string             `json:"fiscalAddress"`
	VerifiedAt              string             `json:"verifiedAt"`
	StripeAccountID         string             `json:"stripeAccountId"`
	StripeChargesEnabled    bool               `json:"stripeChargesEnabled"`
	StripePayoutsEnabled    bool               `json:"stripePayoutsEnabled"`
	StripeDetailsSubmitted  bool               `json:"stripeDetailsSubmitted"`
	AgreementVersion        string             `json:"agreementVersion"`
	AgreementAcceptedAt     string             `json:"agreementAcceptedAt"`
	Standard                CommissionStandard `json:"standard"`
	CommissionOverride      *CommissionTerms   `json:"commissionOverride"`
	CommissionRevision      int64              `json:"commissionRevision"`
	EventCount              int64              `json:"eventCount"`
	UpcomingCount           int64              `json:"upcomingCount"`
	LiveRefundsAttention    int64              `json:"liveRefundsAttention"`
	TestRefundsAttention    int64              `json:"testRefundsAttention"`
	UnknownRefundsAttention int64              `json:"unknownRefundsAttention"`
	RecentEvents            []DirectoryEvent   `json:"recentEvents"`
}

func validDirectorySearch(input *DirectorySearch) (pgtype.UUID, bool) {
	input.Search = strings.TrimSpace(input.Search)
	if input.Status == "" {
		input.Status = "all"
	}
	var after pgtype.UUID
	if input.After != "" && (len(input.After) != 36 || after.Scan(input.After) != nil || !after.Valid) {
		return after, false
	}
	if !utf8.ValidString(input.Search) || len(input.Search) > 200 || strings.ContainsAny(input.Search, "\x00\r\n") {
		return after, false
	}
	return after, input.Status == "all" || input.Status == "pending" || input.Status == "approved" || input.Status == "rejected"
}

// Search uses a POST body so company/email searches never enter URI access logs.
// This is read-only; the legacy bare-array endpoint remains backward compatible.
func (h *Handler) HandleAdminOrganizerDirectory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if _, ok := commissionAdmin(w, r); !ok {
		return
	}
	var input DirectorySearch
	if !router.DecodeJSON(w, r, &input, 4096) {
		return
	}
	after, ok := validDirectorySearch(&input)
	if !ok {
		router.RespondWithError(w, 400, "INVALID_DIRECTORY_FILTER")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	rows, err := h.Queries.AdminOrganizerDirectory(ctx, db.AdminOrganizerDirectoryParams{Status: input.Status, Search: input.Search, AfterID: after})
	if err != nil {
		router.RespondWithError(w, 500, "DIRECTORY_UNAVAILABLE")
		return
	}
	page := DirectoryPage{Items: make([]DirectoryItem, 0, 25)}
	if len(rows) > 25 {
		page.NextCursor = common.UUIDToString(rows[24].UserID)
		rows = rows[:25]
	}
	for _, row := range rows {
		page.Items = append(page.Items, DirectoryItem{
			UserID: common.UUIDToString(row.UserID), CompanyName: row.CompanyName, CUI: row.Cui, Username: row.Username, Email: row.Email,
			VerificationStatus: string(row.VerificationStatus), AccountActive: row.AccountActive, StripeStatus: row.StripeStatus,
			CreatedAt: common.TimestampToString(row.CreatedAt), UpdatedAt: common.TimestampToString(row.UpdatedAt),
		})
	}
	router.RespondWithJSON(w, 200, page)
}

func (h *Handler) HandleAdminOrganizerDetail(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if _, ok := commissionAdmin(w, r); !ok {
		return
	}
	var id pgtype.UUID
	if value := chi.URLParam(r, "id"); len(value) != 36 || id.Scan(value) != nil || !id.Valid {
		router.RespondWithError(w, 400, "INVALID_ORGANIZER_ID")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
	defer cancel()
	row, err := h.Queries.AdminOrganizerDetail(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, 404, "ORGANIZER_NOT_FOUND")
		return
	}
	if err != nil {
		router.RespondWithError(w, 500, "ORGANIZER_UNAVAILABLE")
		return
	}
	events, err := h.Queries.AdminOrganizerRecentEvents(ctx, id)
	if err != nil {
		router.RespondWithError(w, 500, "EVENTS_UNAVAILABLE")
		return
	}
	stripe := "notConnected"
	if row.StripeAccountID.Valid {
		stripe = "onboarding"
		if row.StripeDetailsSubmitted {
			stripe = "attention"
			if row.StripeChargesEnabled && row.StripePayoutsEnabled {
				stripe = "active"
			}
		}
	}
	result := DirectoryDetail{
		DirectoryItem: DirectoryItem{UserID: common.UUIDToString(row.UserID), CompanyName: row.CompanyName, CUI: row.Cui, Username: row.Username, Email: row.Email,
			VerificationStatus: string(row.VerificationStatus), AccountActive: row.AccountActive, StripeStatus: stripe,
			CreatedAt: common.TimestampToString(row.CreatedAt), UpdatedAt: common.TimestampToString(row.UpdatedAt)},
		FiscalAddress: row.FiscalAddress, VerifiedAt: common.TimestampToString(row.VerifiedAt), StripeAccountID: row.StripeAccountID.String,
		StripeChargesEnabled: row.StripeChargesEnabled, StripePayoutsEnabled: row.StripePayoutsEnabled, StripeDetailsSubmitted: row.StripeDetailsSubmitted,
		AgreementVersion: row.AgreementVersion, AgreementAcceptedAt: common.TimestampToString(row.OrganizerAgreementAcceptedAt),
		Standard: CommissionStandard{CommissionTerms{row.StandardRateBps, row.StandardPerTicketBani}, row.StandardRevision}, CommissionRevision: row.CommissionRevision,
		EventCount: row.EventCount, UpcomingCount: row.UpcomingCount, LiveRefundsAttention: row.LiveRefundsAttention, TestRefundsAttention: row.TestRefundsAttention, UnknownRefundsAttention: row.UnknownRefundsAttention,
		RecentEvents: make([]DirectoryEvent, 0, len(events)),
	}
	if row.CustomRateBps.Valid {
		result.CommissionOverride = &CommissionTerms{row.CustomRateBps.Int32, row.CustomPerTicketBani.Int32}
	}
	for _, e := range events {
		result.RecentEvents = append(result.RecentEvents, DirectoryEvent{common.UUIDToString(e.ID), e.Title, common.TimestampToString(e.StartTime), string(e.Status), e.LocationName})
	}
	router.RespondWithJSON(w, 200, result)
}
