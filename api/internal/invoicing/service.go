package invoicing

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

type Service struct {
	queries   *db.Queries
	cipher    *credentialCipher
	cipherErr error
	providers map[string]invoiceProvider
	wake      chan struct{}
}

func NewService(queries *db.Queries, encryptionKey string) *Service {
	cipher, cipherErr := newCredentialCipher(encryptionKey)
	client := &http.Client{Timeout: 20 * time.Second}
	return &Service{
		queries:   queries,
		cipher:    cipher,
		cipherErr: cipherErr,
		providers: map[string]invoiceProvider{
			ProviderOblio:     newOblioProvider(client),
			ProviderSmartBill: newSmartBillProvider(client),
		},
		wake: make(chan struct{}, 1),
	}
}

func (s *Service) ConfigurationError() error { return s.cipherErr }

func (s *Service) GetSettings(ctx context.Context, organizerID pgtype.UUID) (SettingsResponse, error) {
	settings, err := s.queries.GetOrganizerInvoicingSettings(ctx, organizerID)
	if errors.Is(err, pgx.ErrNoRows) {
		return SettingsResponse{}, nil
	}
	if err != nil {
		return SettingsResponse{}, err
	}
	percentage, err := numericToFloat(settings.VatPercentage)
	if err != nil {
		return SettingsResponse{}, err
	}
	return SettingsResponse{
		Connected:      true,
		Provider:       settings.Provider,
		Enabled:        settings.Enabled,
		AccountEmail:   settings.AccountEmail,
		CompanyVATCode: settings.CompanyVatCode,
		SeriesName:     settings.SeriesName,
		VATName:        settings.VatName,
		VATPercentage:  percentage,
		SendEmail:      settings.SendEmail,
		SendToSPV:      settings.SendToSpv,
		CredentialsSet: len(settings.CredentialsEncrypted) > 0,
	}, nil
}

func (s *Service) SaveSettings(ctx context.Context, organizerID pgtype.UUID, input SettingsInput) (SettingsResponse, error) {
	if s.cipherErr != nil {
		return SettingsResponse{}, s.cipherErr
	}

	input.Provider = strings.ToLower(strings.TrimSpace(input.Provider))
	provider, ok := s.providers[input.Provider]
	if !ok {
		return SettingsResponse{}, errors.New("operatorul de facturare nu este acceptat")
	}
	input.AccountEmail = strings.TrimSpace(input.AccountEmail)
	if address, err := mail.ParseAddress(input.AccountEmail); err != nil || address.Address != input.AccountEmail {
		return SettingsResponse{}, errors.New("emailul contului de facturare este invalid")
	}
	companyVATCode, err := common.NormalizeCUI(input.CompanyVATCode)
	if err != nil {
		return SettingsResponse{}, err
	}
	input.CompanyVATCode = companyVATCode
	input.SeriesName = strings.TrimSpace(input.SeriesName)
	input.VATName = strings.TrimSpace(input.VATName)
	if input.CompanyVATCode == "" || input.SeriesName == "" {
		return SettingsResponse{}, errors.New("CIF-ul si seria facturii sunt obligatorii")
	}
	if input.VATPercentage < 0 || input.VATPercentage > 100 {
		return SettingsResponse{}, errors.New("cota TVA trebuie sa fie intre 0 si 100")
	}
	if input.VATName == "" {
		input.VATName = "Normala"
	}

	profile, err := s.queries.GetOrganizerProfile(ctx, organizerID)
	if err != nil {
		return SettingsResponse{}, errors.New("profilul organizatorului nu a putut fi verificat")
	}
	if !profile.IsVerified.Bool || profile.VerificationStatus != db.VerificationStatusTypeApproved {
		return SettingsResponse{}, errors.New("firma trebuie aprobata in Spottr inainte de conectarea facturarii")
	}
	profileCUI, err := common.NormalizeCUI(profile.Cui)
	if err != nil || profileCUI != input.CompanyVATCode {
		return SettingsResponse{}, errors.New("CIF-ul contului de facturare trebuie sa fie acelasi cu CUI-ul firmei verificate")
	}

	apiToken := strings.TrimSpace(input.APIToken)
	if apiToken == "" {
		existing, err := s.queries.GetOrganizerInvoicingSettings(ctx, organizerID)
		if err != nil || existing.Provider != input.Provider || existing.AccountEmail != input.AccountEmail {
			return SettingsResponse{}, errors.New("tokenul API este obligatoriu la conectare sau la schimbarea contului")
		}
		plaintext, err := s.cipher.decrypt(existing.CredentialsEncrypted, credentialContext(organizerID, existing.Provider))
		if err != nil {
			return SettingsResponse{}, err
		}
		apiToken = string(plaintext)
	}

	verificationContext, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if err := provider.Verify(verificationContext, input, apiToken); err != nil {
		return SettingsResponse{}, fmt.Errorf("conectarea nu a putut fi verificata: %w", err)
	}

	encrypted, err := s.cipher.encrypt([]byte(apiToken), credentialContext(organizerID, input.Provider))
	if err != nil {
		return SettingsResponse{}, err
	}
	vatPercentage, err := floatToNumeric(input.VATPercentage)
	if err != nil {
		return SettingsResponse{}, err
	}
	_, err = s.queries.UpsertOrganizerInvoicingSettings(ctx, db.UpsertOrganizerInvoicingSettingsParams{
		OrganizerID:          organizerID,
		Provider:             input.Provider,
		Enabled:              input.Enabled,
		AccountEmail:         input.AccountEmail,
		CredentialsEncrypted: encrypted,
		CompanyVatCode:       input.CompanyVATCode,
		SeriesName:           input.SeriesName,
		VatName:              input.VATName,
		VatPercentage:        vatPercentage,
		SendEmail:            input.SendEmail,
		SendToSpv:            input.SendToSPV,
	})
	if err != nil {
		return SettingsResponse{}, err
	}
	return s.GetSettings(ctx, organizerID)
}

func (s *Service) DeleteSettings(ctx context.Context, organizerID pgtype.UUID) error {
	_, err := s.queries.DeleteOrganizerInvoicingSettings(ctx, organizerID)
	return err
}

func (s *Service) QueueOrder(ctx context.Context, orderID pgtype.UUID) error {
	_, err := s.queries.CreateBillingInvoiceForOrder(ctx, orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err == nil {
		s.Wake()
	}
	return err
}

func (s *Service) Wake() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *Service) StartWorker(ctx context.Context) {
	go func() {
		workTicker := time.NewTicker(15 * time.Second)
		backfillTicker := time.NewTicker(time.Minute)
		defer workTicker.Stop()
		defer backfillTicker.Stop()

		s.backfill(ctx)
		s.processAvailable(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-s.wake:
				s.processAvailable(ctx)
			case <-workTicker.C:
				s.processAvailable(ctx)
			case <-backfillTicker.C:
				s.backfill(ctx)
			}
		}
	}()
}

func (s *Service) backfill(ctx context.Context) {
	if _, err := s.queries.BackfillBillingInvoices(ctx); err != nil && ctx.Err() == nil {
		log.Printf("invoicing backfill failed: %v", err)
	}
}

func (s *Service) processAvailable(ctx context.Context) {
	jobs, err := s.queries.ClaimBillingInvoices(ctx, 3)
	if err != nil {
		if ctx.Err() == nil {
			log.Printf("invoicing jobs claim failed: %v", err)
		}
		return
	}
	for index, job := range jobs {
		if index > 0 {
			select {
			case <-ctx.Done():
				return
			case <-time.After(400 * time.Millisecond):
			}
		}
		s.processJob(ctx, job)
	}
}

func (s *Service) processJob(ctx context.Context, job db.BillingInvoices) {
	fail := func(err error, needsReview bool) {
		retrySeconds := int32(math.Min(3600, 15*math.Pow(2, float64(max(0, job.AttemptCount-1)))))
		if _, markErr := s.queries.MarkBillingInvoiceFailed(ctx, db.MarkBillingInvoiceFailedParams{
			ID:           job.ID,
			NeedsReview:  needsReview,
			ErrorMessage: pgtype.Text{String: truncateError(err), Valid: true},
			RetrySeconds: retrySeconds,
		}); markErr != nil {
			log.Printf("billing invoice failure could not be persisted: invoice=%s err=%v", common.UUIDToString(job.ID), markErr)
		}
	}

	if s.cipherErr != nil {
		fail(s.cipherErr, true)
		return
	}
	data, err := s.queries.GetBillingInvoiceIssueData(ctx, job.ID)
	if err != nil {
		fail(fmt.Errorf("load invoice data: %w", err), errors.Is(err, pgx.ErrNoRows))
		return
	}
	if !data.IntegrationEnabled || data.ConfiguredProvider != data.Provider {
		fail(errors.New("integrarea de facturare a fost dezactivata sau schimbata"), true)
		return
	}
	provider, ok := s.providers[data.Provider]
	if !ok {
		fail(errors.New("operator de facturare necunoscut"), true)
		return
	}
	apiToken, err := s.cipher.decrypt(data.CredentialsEncrypted, credentialContext(data.OrganizerID, data.Provider))
	if err != nil {
		fail(err, true)
		return
	}
	items, err := s.queries.ListBillingInvoiceItems(ctx, data.OrderID)
	if err != nil || len(items) == 0 {
		if err == nil {
			err = errors.New("comanda nu are pozitii facturabile")
		}
		fail(err, true)
		return
	}
	vatPercentage, err := numericToFloat(data.VatPercentage)
	if err != nil {
		fail(err, true)
		return
	}
	invoiceItems := make([]InvoiceItem, 0, len(items))
	for _, item := range items {
		invoiceItems = append(invoiceItems, InvoiceItem{
			Name:      "Bilet " + data.EventTitle + " - " + item.TicketTypeName,
			Code:      "SPOTTR-" + strings.ReplaceAll(common.UUIDToString(item.TicketTypeID), "-", "")[:12],
			Quantity:  item.Quantity,
			UnitPrice: float64(item.UnitPriceRon),
		})
	}

	requestContext, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	result, err := provider.Issue(requestContext, InvoiceRequest{
		InvoiceID:         common.UUIDToString(data.InvoiceID),
		OrderID:           common.UUIDToString(data.OrderID),
		PaymentIntentID:   data.StripePaymentIntentID.String,
		IssueDate:         data.OrderCreatedAt.Time,
		CustomerEmail:     data.Email,
		CustomerType:      data.BillingType,
		CustomerName:      data.BillingName,
		CustomerTaxID:     data.BillingTaxID,
		CustomerRegNumber: data.BillingRegistrationNumber,
		CustomerAddress:   data.BillingAddress,
		CustomerCity:      data.BillingCity,
		CustomerCounty:    data.BillingCounty,
		CustomerSector:    data.BillingSector,
		CustomerCountry:   data.BillingCountry,
		EventTitle:        data.EventTitle,
		Total:             float64(data.TotalAmount),
		Items:             invoiceItems,
		AccountEmail:      data.AccountEmail,
		APIToken:          string(apiToken),
		CompanyVATCode:    data.CompanyVatCode,
		SeriesName:        data.SeriesName,
		VATName:           data.VatName,
		VATPercentage:     vatPercentage,
		SendEmail:         data.SendEmail,
		SendToSPV:         data.SendToSpv,
	})
	if err != nil {
		var failure *providerFailure
		fail(err, errors.As(err, &failure) && failure.needsReview)
		return
	}
	if _, err := s.queries.MarkBillingInvoiceIssued(ctx, db.MarkBillingInvoiceIssuedParams{
		ID:                 job.ID,
		ExternalSeries:     optionalText(result.Series),
		ExternalNumber:     optionalText(result.Number),
		ExternalDocumentID: optionalText(result.DocumentID),
		DocumentUrl:        optionalText(result.DocumentURL),
	}); err != nil {
		log.Printf("issued invoice could not be persisted: invoice=%s provider=%s series=%s number=%s err=%v", common.UUIDToString(job.ID), data.Provider, result.Series, result.Number, err)
	}
}

func credentialContext(organizerID pgtype.UUID, provider string) string {
	return common.UUIDToString(organizerID) + ":" + provider
}

func numericToFloat(value pgtype.Numeric) (float64, error) {
	result, err := value.Float64Value()
	if err != nil || !result.Valid {
		return 0, errors.New("cota TVA configurata este invalida")
	}
	return result.Float64, nil
}

func floatToNumeric(value float64) (pgtype.Numeric, error) {
	var numeric pgtype.Numeric
	err := numeric.Scan(strconv.FormatFloat(value, 'f', 2, 64))
	return numeric, err
}

func optionalText(value string) pgtype.Text {
	return pgtype.Text{String: value, Valid: strings.TrimSpace(value) != ""}
}

func truncateError(err error) string {
	if err == nil {
		return "eroare necunoscuta"
	}
	message := err.Error()
	if len(message) > 1500 {
		return message[:1500]
	}
	return message
}
