package invoicing

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
	"pulse-api/internal/router"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type InvoiceResponse struct {
	ID                 string `json:"id"`
	OrderID            string `json:"orderId"`
	Provider           string `json:"provider"`
	Status             string `json:"status"`
	AttemptCount       int32  `json:"attemptCount"`
	Series             string `json:"series,omitempty"`
	Number             string `json:"number,omitempty"`
	DocumentURL        string `json:"documentUrl,omitempty"`
	ErrorMessage       string `json:"errorMessage,omitempty"`
	IssuedAt           string `json:"issuedAt,omitempty"`
	CreatedAt          string `json:"createdAt"`
	CustomerName       string `json:"customerName"`
	CustomerEmail      string `json:"customerEmail"`
	TotalAmountRon     int32  `json:"totalAmountRon"`
	EventTitle         string `json:"eventTitle"`
	RefundStatus       string `json:"refundStatus,omitempty"`
	RefundSeries       string `json:"refundSeries,omitempty"`
	RefundNumber       string `json:"refundNumber,omitempty"`
	RefundDocumentURL  string `json:"refundDocumentUrl,omitempty"`
	RefundErrorMessage string `json:"refundErrorMessage,omitempty"`
}

type PlatformCommissionInvoiceResponse struct {
	ID               string `json:"id"`
	Provider         string `json:"provider"`
	Status           string `json:"status"`
	TransactionCount int32  `json:"transactionCount"`
	TotalFeeBani     int64  `json:"totalFeeBani"`
	Series           string `json:"series,omitempty"`
	Number           string `json:"number,omitempty"`
	DocumentURL      string `json:"documentUrl,omitempty"`
	PeriodStart      string `json:"periodStart"`
	PeriodEnd        string `json:"periodEnd"`
	IssuedAt         string `json:"issuedAt,omitempty"`
	CreatedAt        string `json:"createdAt"`
}

func (s *Service) HandleGetSettings(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := organizerIDFromRequest(w, r)
	if !ok {
		return
	}
	settings, err := s.GetSettings(r.Context(), organizerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Setarile de facturare nu au putut fi incarcate")
		return
	}
	router.RespondWithJSON(w, http.StatusOK, settings)
}

func (s *Service) HandleSaveSettings(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := organizerIDFromRequest(w, r)
	if !ok {
		return
	}
	var input SettingsInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Datele integrarii sunt invalide")
		return
	}
	settings, err := s.SaveSettings(r.Context(), organizerID, input)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, s.cipherErr) {
			status = http.StatusServiceUnavailable
		}
		router.RespondWithError(w, status, err.Error())
		return
	}
	router.RespondWithJSON(w, http.StatusOK, settings)
}

func (s *Service) HandleGetProviderOptions(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := organizerIDFromRequest(w, r)
	if !ok {
		return
	}
	var input ProviderConnectionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		router.RespondWithError(w, http.StatusBadRequest, "Datele integrarii sunt invalide")
		return
	}
	options, err := s.GetProviderOptions(r.Context(), organizerID, input)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, s.cipherErr) {
			status = http.StatusServiceUnavailable
		}
		router.RespondWithError(w, status, err.Error())
		return
	}
	router.RespondWithJSON(w, http.StatusOK, options)
}

func (s *Service) HandleDeleteSettings(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := organizerIDFromRequest(w, r)
	if !ok {
		return
	}
	if err := s.DeleteSettings(r.Context(), organizerID); err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Integrarea nu a putut fi deconectata")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) HandleListInvoices(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := organizerIDFromRequest(w, r)
	if !ok {
		return
	}
	rows, err := s.queries.ListOrganizerBillingInvoices(r.Context(), organizerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Facturile nu au putut fi incarcate")
		return
	}
	result := make([]InvoiceResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, InvoiceResponse{
			ID:                 common.UUIDToString(row.ID),
			OrderID:            common.UUIDToString(row.OrderID),
			Provider:           row.Provider,
			Status:             row.Status,
			AttemptCount:       row.AttemptCount,
			Series:             row.ExternalSeries.String,
			Number:             row.ExternalNumber.String,
			DocumentURL:        row.DocumentUrl.String,
			ErrorMessage:       row.ErrorMessage.String,
			IssuedAt:           common.TimestampToString(row.IssuedAt),
			CreatedAt:          common.TimestampToString(row.CreatedAt),
			CustomerName:       row.BillingName,
			CustomerEmail:      row.Email,
			TotalAmountRon:     row.TotalAmount,
			EventTitle:         row.EventTitle,
			RefundStatus:       row.RefundStatus.String,
			RefundSeries:       row.RefundExternalSeries.String,
			RefundNumber:       row.RefundExternalNumber.String,
			RefundDocumentURL:  row.RefundDocumentUrl.String,
			RefundErrorMessage: row.RefundErrorMessage.String,
		})
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (s *Service) HandleListPlatformCommissionInvoices(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := organizerIDFromRequest(w, r)
	if !ok {
		return
	}
	rows, err := s.queries.ListOrganizerPlatformCommissionInvoices(r.Context(), organizerID)
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Facturile SPOTTR nu au putut fi incarcate")
		return
	}
	result := make([]PlatformCommissionInvoiceResponse, 0, len(rows))
	for _, row := range rows {
		result = append(result, PlatformCommissionInvoiceResponse{
			ID:               common.UUIDToString(row.ID),
			Provider:         row.Provider,
			Status:           row.Status,
			TransactionCount: row.TransactionCount,
			TotalFeeBani:     row.TotalFeeBani,
			Series:           row.ExternalSeries.String,
			Number:           row.ExternalNumber.String,
			DocumentURL:      row.DocumentUrl.String,
			PeriodStart:      dateString(row.PeriodStart),
			PeriodEnd:        dateString(row.PeriodEnd),
			IssuedAt:         common.TimestampToString(row.IssuedAt),
			CreatedAt:        common.TimestampToString(row.CreatedAt),
		})
	}
	router.RespondWithJSON(w, http.StatusOK, result)
}

func (s *Service) HandleRetryInvoice(w http.ResponseWriter, r *http.Request) {
	organizerID, ok := organizerIDFromRequest(w, r)
	if !ok {
		return
	}
	var invoiceID pgtype.UUID
	if err := invoiceID.Scan(strings.TrimSpace(chi.URLParam(r, "id"))); err != nil || !invoiceID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul facturii este invalid")
		return
	}
	_, err := s.queries.RetryBillingInvoice(r.Context(), db.RetryBillingInvoiceParams{
		ID: invoiceID, OrganizerID: organizerID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		_, err = s.queries.RetryBillingInvoiceRefund(r.Context(), db.RetryBillingInvoiceRefundParams{
			BillingInvoiceID: invoiceID, OrganizerID: organizerID,
		})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		router.RespondWithError(w, http.StatusConflict, "Factura nu poate fi retrimisa in starea curenta")
		return
	}
	if err != nil {
		router.RespondWithError(w, http.StatusInternalServerError, "Factura nu a putut fi pusa din nou in coada")
		return
	}
	s.Wake()
	router.RespondWithJSON(w, http.StatusAccepted, map[string]string{"status": "pending"})
}

func organizerIDFromRequest(w http.ResponseWriter, r *http.Request) (pgtype.UUID, bool) {
	value, err := auth.GetUserIDFromContext(r.Context())
	if err != nil || value == "" {
		router.RespondWithError(w, http.StatusUnauthorized, "Utilizator neautentificat")
		return pgtype.UUID{}, false
	}
	var organizerID pgtype.UUID
	if err := organizerID.Scan(value); err != nil || !organizerID.Valid {
		router.RespondWithError(w, http.StatusBadRequest, "ID-ul organizatorului este invalid")
		return pgtype.UUID{}, false
	}
	return organizerID, true
}

func dateString(value pgtype.Date) string {
	if !value.Valid {
		return ""
	}
	return value.Time.Format("2006-01-02")
}
