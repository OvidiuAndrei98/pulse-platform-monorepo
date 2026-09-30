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
	_ "time/tzdata"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	queries           *db.Queries
	pool              *pgxpool.Pool
	cipher            *credentialCipher
	cipherErr         error
	providers         map[string]invoiceProvider
	platformConfig    PlatformInvoiceConfig
	platformConfigErr error
	wake              chan struct{}
}

func NewService(queries *db.Queries, pool *pgxpool.Pool, encryptionKey string) *Service {
	cipher, cipherErr := newCredentialCipher(encryptionKey)
	platformConfig, platformConfigErr := loadPlatformInvoiceConfig()
	client := &http.Client{Timeout: 20 * time.Second}
	return &Service{
		queries:           queries,
		pool:              pool,
		cipher:            cipher,
		cipherErr:         cipherErr,
		platformConfig:    platformConfig,
		platformConfigErr: platformConfigErr,
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

func (s *Service) GetProviderOptions(ctx context.Context, organizerID pgtype.UUID, input ProviderConnectionInput) (ProviderOptions, error) {
	if s.cipherErr != nil {
		return ProviderOptions{}, s.cipherErr
	}

	normalized, provider, err := s.prepareConnection(ctx, organizerID, input)
	if err != nil {
		return ProviderOptions{}, err
	}
	apiToken, err := s.resolveAPIToken(ctx, organizerID, normalized, input.APIToken)
	if err != nil {
		return ProviderOptions{}, err
	}

	requestContext, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	options, err := provider.Options(requestContext, normalized, apiToken)
	if err != nil {
		return ProviderOptions{}, fmt.Errorf("conectarea nu a putut fi verificata: %w", err)
	}
	if len(options.Series) == 0 {
		return ProviderOptions{}, errors.New("contul nu are nicio serie de factura disponibila")
	}
	return normalizeProviderOptions(options), nil
}

func (s *Service) SaveSettings(ctx context.Context, organizerID pgtype.UUID, input SettingsInput) (SettingsResponse, error) {
	if s.cipherErr != nil {
		return SettingsResponse{}, s.cipherErr
	}

	connection, provider, err := s.prepareConnection(ctx, organizerID, ProviderConnectionInput{
		Provider: input.Provider, AccountEmail: input.AccountEmail, CompanyVATCode: input.CompanyVATCode,
	})
	if err != nil {
		return SettingsResponse{}, err
	}
	input.Provider = connection.Provider
	input.AccountEmail = connection.AccountEmail
	input.CompanyVATCode = connection.CompanyVATCode
	input.SeriesName = strings.TrimSpace(input.SeriesName)
	input.VATName = strings.TrimSpace(input.VATName)
	if input.CompanyVATCode == "" || input.SeriesName == "" {
		return SettingsResponse{}, errors.New("CIF-ul si seria facturii sunt obligatorii")
	}
	if input.VATPercentage < 0 || input.VATPercentage > 100 {
		return SettingsResponse{}, errors.New("cota TVA trebuie sa fie intre 0 si 100")
	}
	apiToken, err := s.resolveAPIToken(ctx, organizerID, connection, input.APIToken)
	if err != nil {
		return SettingsResponse{}, err
	}

	verificationContext, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	options, err := provider.Options(verificationContext, connection, apiToken)
	if err != nil {
		return SettingsResponse{}, fmt.Errorf("conectarea nu a putut fi verificata: %w", err)
	}
	if !containsSeries(options.Series, input.SeriesName) {
		return SettingsResponse{}, fmt.Errorf("seria de factura %q nu exista in contul %s", input.SeriesName, input.Provider)
	}
	if !containsVATRate(normalizeProviderOptions(options).VATRates, input.VATName, input.VATPercentage) {
		return SettingsResponse{}, errors.New("cota TVA selectata nu exista in nomenclatorul contului de facturare")
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

func (s *Service) prepareConnection(ctx context.Context, organizerID pgtype.UUID, input ProviderConnectionInput) (ProviderConnectionInput, invoiceProvider, error) {
	input.Provider = strings.ToLower(strings.TrimSpace(input.Provider))
	provider, ok := s.providers[input.Provider]
	if !ok {
		return ProviderConnectionInput{}, nil, errors.New("operatorul de facturare nu este acceptat")
	}
	input.AccountEmail = strings.TrimSpace(input.AccountEmail)
	if address, err := mail.ParseAddress(input.AccountEmail); err != nil || address.Address != input.AccountEmail {
		return ProviderConnectionInput{}, nil, errors.New("emailul contului de facturare este invalid")
	}
	providerVATCode, normalizedCUI, err := normalizeProviderVATCode(input.CompanyVATCode)
	if err != nil {
		return ProviderConnectionInput{}, nil, err
	}
	input.CompanyVATCode = providerVATCode

	profile, err := s.queries.GetOrganizerProfile(ctx, organizerID)
	if err != nil {
		return ProviderConnectionInput{}, nil, errors.New("profilul organizatorului nu a putut fi verificat")
	}
	if !profile.IsVerified.Bool || profile.VerificationStatus != db.VerificationStatusTypeApproved {
		return ProviderConnectionInput{}, nil, errors.New("firma trebuie aprobata in Spottr inainte de conectarea facturarii")
	}
	profileCUI, err := common.NormalizeCUI(profile.Cui)
	if err != nil || profileCUI != normalizedCUI {
		return ProviderConnectionInput{}, nil, errors.New("CIF-ul contului de facturare trebuie sa fie acelasi cu CUI-ul firmei verificate")
	}
	return input, provider, nil
}

func (s *Service) resolveAPIToken(ctx context.Context, organizerID pgtype.UUID, input ProviderConnectionInput, candidate string) (string, error) {
	if apiToken := strings.TrimSpace(candidate); apiToken != "" {
		return apiToken, nil
	}
	existing, err := s.queries.GetOrganizerInvoicingSettings(ctx, organizerID)
	existingCUI, existingCUIErr := common.NormalizeCUI(existing.CompanyVatCode)
	inputCUI, inputCUIErr := common.NormalizeCUI(input.CompanyVATCode)
	if err != nil || existing.Provider != input.Provider || existing.AccountEmail != input.AccountEmail || existingCUIErr != nil || inputCUIErr != nil || existingCUI != inputCUI {
		return "", errors.New("tokenul API este obligatoriu la conectare sau la schimbarea contului")
	}
	plaintext, err := s.cipher.decrypt(existing.CredentialsEncrypted, credentialContext(organizerID, existing.Provider))
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func normalizeProviderVATCode(raw string) (string, string, error) {
	compact := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(raw), " ", ""))
	normalized, err := common.NormalizeCUI(compact)
	if err != nil {
		return "", "", err
	}
	if strings.HasPrefix(compact, "RO") {
		return "RO" + normalized, normalized, nil
	}
	return normalized, normalized, nil
}

func normalizeProviderOptions(options ProviderOptions) ProviderOptions {
	if options.Series == nil {
		options.Series = make([]SeriesOption, 0)
	}
	if len(options.VATRates) == 0 {
		options.VATRates = []VATRateOption{{Name: "", Percentage: 0, Default: true}}
	}
	return options
}

func containsSeries(options []SeriesOption, value string) bool {
	for _, option := range options {
		if option.Name == value {
			return true
		}
	}
	return false
}

func containsVATRate(options []VATRateOption, name string, percentage float64) bool {
	for _, option := range options {
		if option.Name == name && math.Abs(option.Percentage-percentage) < 0.001 {
			return true
		}
	}
	return false
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

func (s *Service) QueueOrderRefund(ctx context.Context, orderID pgtype.UUID) error {
	if _, err := s.queries.DeleteUnissuedBillingInvoiceForRefund(ctx, orderID); err != nil {
		return err
	}
	_, err := s.queries.CreateBillingInvoiceRefundForOrder(ctx, orderID)
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
		monthlyTicker := time.NewTicker(time.Hour)
		defer workTicker.Stop()
		defer backfillTicker.Stop()
		defer monthlyTicker.Stop()

		if s.platformConfigErr != nil {
			log.Printf("SPOTTR monthly invoicing is disabled: %v", s.platformConfigErr)
		}
		s.backfill(ctx)
		s.queuePreviousMonth(ctx, time.Now())
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
			case now := <-monthlyTicker.C:
				s.queuePreviousMonth(ctx, now)
			}
		}
	}()
}

func (s *Service) backfill(ctx context.Context) {
	if _, err := s.queries.BackfillBillingInvoices(ctx); err != nil && ctx.Err() == nil {
		log.Printf("invoicing backfill failed: %v", err)
	}
	if _, err := s.queries.DeleteUnissuedBillingInvoicesForRefundedOrders(ctx); err != nil && ctx.Err() == nil {
		log.Printf("refunded order invoice cleanup failed: %v", err)
	}
	if _, err := s.queries.BackfillBillingInvoiceRefunds(ctx); err != nil && ctx.Err() == nil {
		log.Printf("invoice refund backfill failed: %v", err)
	}
	if count, err := s.queries.MarkStalePromotionInvoiceDispatchesForReview(ctx); err != nil && ctx.Err() == nil {
		log.Printf("stale promotion invoice dispatch cleanup failed: %v", err)
	} else if count > 0 {
		log.Printf("moved %d ambiguous promotion invoice dispatches to manual review", count)
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
	s.processInvoiceRefunds(ctx)
	s.processPlatformInvoices(ctx)
	s.processPromotionInvoices(ctx)
}

func (s *Service) processPromotionInvoices(ctx context.Context) {
	if !s.platformConfig.Enabled || s.platformConfigErr != nil {
		return
	}
	jobs, err := s.queries.ClaimPromotionInvoices(ctx, 2)
	if err != nil {
		if ctx.Err() == nil {
			log.Printf("promotion invoice jobs claim failed: %v", err)
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
		s.processPromotionInvoice(ctx, job)
	}
}

func (s *Service) processPromotionInvoice(ctx context.Context, job db.PromotionInvoices) {
	fail := func(err error, needsReview bool) {
		retrySeconds := int32(math.Min(3600, 15*math.Pow(2, float64(max(0, job.AttemptCount-1)))))
		if _, markErr := s.queries.MarkPromotionInvoiceFailed(ctx, db.MarkPromotionInvoiceFailedParams{
			ID: job.ID, ClaimToken: job.ClaimToken, NeedsReview: needsReview,
			ErrorMessage: pgtype.Text{String: truncateError(err), Valid: true}, RetrySeconds: retrySeconds,
		}); markErr != nil {
			log.Printf("promotion invoice failure could not be persisted: invoice=%s err=%v", common.UUIDToString(job.ID), markErr)
		}
	}

	if s.pool == nil {
		fail(errors.New("baza de date pentru facturarea promovarii nu este disponibila"), true)
		return
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		fail(fmt.Errorf("start promotion invoice lock transaction: %w", err), false)
		return
	}
	defer tx.Rollback(ctx)
	qtx := s.queries.WithTx(tx)
	if err := qtx.LockPromotionPaymentIntent(ctx, job.PaymentIntentID); err != nil {
		fail(fmt.Errorf("lock promotion payment: %w", err), false)
		return
	}
	data, err := qtx.GetPromotionInvoiceIssueData(ctx, job.ID)
	if err != nil {
		fail(fmt.Errorf("load promotion invoice data: %w", err), errors.Is(err, pgx.ErrNoRows))
		return
	}
	if !data.StripeLivemode {
		fail(errors.New("factura de promovare nu apartine unei plati Stripe live"), true)
		return
	}
	if data.Provider != s.platformConfig.Provider ||
		data.IssuerAccountEmail != s.platformConfig.AccountEmail ||
		data.IssuerCompanyVatCode != s.platformConfig.CompanyVATCode {
		fail(errors.New("configuratia emitentului SPOTTR s-a schimbat; este necesara verificarea manuala"), true)
		return
	}
	provider, ok := s.providers[data.Provider]
	if !ok {
		fail(errors.New("operator de facturare SPOTTR necunoscut"), true)
		return
	}
	vatPercentage, err := numericToFloat(data.VatPercentage)
	if err != nil {
		fail(err, true)
		return
	}
	if !data.ClaimToken.Valid || data.PaymentIntentID == "" || data.AmountBani <= 0 {
		fail(errors.New("snapshotul facturii de promovare este incomplet"), true)
		return
	}

	started, err := qtx.BeginPromotionInvoiceDispatch(ctx, db.BeginPromotionInvoiceDispatchParams{
		ID: data.ID, ClaimToken: data.ClaimToken,
	})
	if err != nil {
		fail(fmt.Errorf("start promotion invoice dispatch: %w", err), false)
		return
	}
	if started != 1 {
		return
	}
	if err := tx.Commit(ctx); err != nil {
		fail(fmt.Errorf("commit promotion invoice dispatch: %w", err), false)
		return
	}

	invoiceID := common.UUIDToString(data.ID)
	totalRon := float64(data.AmountBani) / 100
	period := data.StartsAt.Time.In(bucharestLocation()).Format("02.01.2006") + " - " +
		data.EndsAt.Time.In(bucharestLocation()).AddDate(0, 0, -1).Format("02.01.2006")
	serviceName := "Servicii de promovare eveniment SPOTTR"
	requestContext, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	result, err := provider.Issue(requestContext, InvoiceRequest{
		InvoiceID: invoiceID, OrderID: "promotion-" + invoiceID,
		PaymentIntentID: data.PaymentIntentID, IssueDate: data.CreatedAt.Time.In(bucharestLocation()),
		CustomerEmail: data.CustomerEmail, CustomerType: data.BillingType,
		CustomerName: data.BillingName, CustomerTaxID: data.BillingTaxID,
		CustomerRegNumber: data.BillingRegistrationNumber, CustomerAddress: data.BillingAddress,
		CustomerCity: data.BillingCity, CustomerCounty: data.BillingCounty,
		CustomerSector: data.BillingSector, CustomerCountry: data.BillingCountry,
		CustomerVATPayer: strings.HasPrefix(strings.ToUpper(strings.TrimSpace(data.BillingTaxID)), "RO"),
		VATPayerKnown:    data.BillingType != "company" || strings.HasPrefix(strings.ToUpper(strings.TrimSpace(data.BillingTaxID)), "RO"),
		EventTitle:       fmt.Sprintf("%s: %s (%s)", serviceName, data.EventTitle, period),
		Total:            totalRon,
		Items:            []InvoiceItem{{Name: serviceName, Code: "SPOTTR-PROMOTION-" + strings.ToUpper(string(data.Placement)), Quantity: 1, UnitPrice: totalRon}},
		AccountEmail:     data.IssuerAccountEmail, APIToken: s.platformConfig.APIToken,
		CompanyVATCode: data.IssuerCompanyVatCode, SeriesName: data.IssuerSeriesName,
		VATName: data.VatName, VATPercentage: vatPercentage, SendEmail: data.SendEmail,
		SendToSPV: data.SendToSpv, PaymentType: data.PaymentType,
		PaymentReference: data.PaymentIntentID,
		InternalNote:     fmt.Sprintf("Promovare SPOTTR %s, plan %s, pozitionare %s, perioada %s", data.EventTitle, data.Plan, data.Placement, period),
	})
	if err != nil {
		// Once dispatch has begun, any transport failure can be ambiguous. Even
		// Oblio's stable idempotency key is preserved, but manual review is safer.
		fail(err, true)
		return
	}
	updated, err := s.queries.MarkPromotionInvoiceIssued(ctx, db.MarkPromotionInvoiceIssuedParams{
		ID: data.ID, ClaimToken: data.ClaimToken,
		ExternalSeries: optionalText(result.Series), ExternalNumber: optionalText(result.Number),
		ExternalDocumentID: optionalText(result.DocumentID), DocumentUrl: optionalText(result.DocumentURL),
	})
	if err != nil || updated != 1 {
		log.Printf("issued promotion invoice has ambiguous persistence: invoice=%s provider=%s series=%s number=%s err=%v", invoiceID, data.Provider, result.Series, result.Number, err)
	}
}

func (s *Service) processInvoiceRefunds(ctx context.Context) {
	jobs, err := s.queries.ClaimBillingInvoiceRefunds(ctx, 3)
	if err != nil {
		if ctx.Err() == nil {
			log.Printf("invoice refund jobs claim failed: %v", err)
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
		s.processInvoiceRefund(ctx, job)
	}
}

func (s *Service) processInvoiceRefund(ctx context.Context, job db.BillingInvoiceRefunds) {
	fail := func(err error, needsReview bool) {
		retrySeconds := int32(math.Min(3600, 15*math.Pow(2, float64(max(0, job.AttemptCount-1)))))
		if _, markErr := s.queries.MarkBillingInvoiceRefundFailed(ctx, db.MarkBillingInvoiceRefundFailedParams{
			ID:           job.ID,
			NeedsReview:  needsReview,
			ErrorMessage: pgtype.Text{String: truncateError(err), Valid: true},
			RetrySeconds: retrySeconds,
		}); markErr != nil {
			log.Printf("invoice refund failure could not be persisted: refund=%s err=%v", common.UUIDToString(job.ID), markErr)
		}
	}

	if s.cipherErr != nil {
		fail(s.cipherErr, true)
		return
	}
	data, err := s.queries.GetBillingInvoiceRefundIssueData(ctx, job.ID)
	if err != nil {
		fail(fmt.Errorf("load invoice refund data: %w", err), errors.Is(err, pgx.ErrNoRows))
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

	requestContext, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	result, err := provider.Refund(requestContext, InvoiceRefundRequest{
		RefundID:       common.UUIDToString(data.ID),
		OrderID:        common.UUIDToString(data.OrderID),
		OriginalSeries: data.OriginalSeries.String,
		OriginalNumber: data.OriginalNumber.String,
		AccountEmail:   data.AccountEmail,
		APIToken:       string(apiToken),
		CompanyVATCode: data.CompanyVatCode,
		SeriesName:     data.SeriesName,
	})
	if err != nil {
		var failure *providerFailure
		fail(err, errors.As(err, &failure) && failure.needsReview)
		return
	}
	if _, err := s.queries.MarkBillingInvoiceRefundIssued(ctx, db.MarkBillingInvoiceRefundIssuedParams{
		ID:                 job.ID,
		ExternalSeries:     optionalText(result.Series),
		ExternalNumber:     optionalText(result.Number),
		ExternalDocumentID: optionalText(result.DocumentID),
		DocumentUrl:        optionalText(result.DocumentURL),
	}); err != nil {
		log.Printf("issued invoice refund could not be persisted: refund=%s provider=%s series=%s number=%s err=%v", common.UUIDToString(job.ID), data.Provider, result.Series, result.Number, err)
	}
}

func (s *Service) queuePreviousMonth(ctx context.Context, now time.Time) {
	if !s.platformConfig.Enabled || s.platformConfigErr != nil {
		return
	}
	periodStart, periodEnd := previousCalendarMonth(now)
	created, err := s.queries.CreateMonthlyPlatformCommissionInvoices(ctx, db.CreateMonthlyPlatformCommissionInvoicesParams{
		PeriodStartAt: pgtype.Timestamptz{Time: periodStart, Valid: true},
		PeriodEndAt:   pgtype.Timestamptz{Time: periodEnd, Valid: true},
		Provider:      s.platformConfig.Provider,
	})
	if err != nil {
		if ctx.Err() == nil {
			log.Printf("SPOTTR monthly invoices could not be queued: %v", err)
		}
		return
	}
	if created > 0 {
		s.Wake()
	}
}

func previousCalendarMonth(now time.Time) (time.Time, time.Time) {
	location := bucharestLocation()
	localNow := now.In(location)
	periodEnd := time.Date(localNow.Year(), localNow.Month(), 1, 0, 0, 0, 0, location)
	return periodEnd.AddDate(0, -1, 0).UTC(), periodEnd.UTC()
}

func bucharestLocation() *time.Location {
	location, err := time.LoadLocation("Europe/Bucharest")
	if err != nil {
		return time.FixedZone("Europe/Bucharest", 2*60*60)
	}
	return location
}

func (s *Service) processPlatformInvoices(ctx context.Context) {
	if !s.platformConfig.Enabled || s.platformConfigErr != nil {
		return
	}
	jobs, err := s.queries.ClaimPlatformCommissionInvoices(ctx, 2)
	if err != nil {
		if ctx.Err() == nil {
			log.Printf("SPOTTR monthly invoice jobs claim failed: %v", err)
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
		s.processPlatformInvoice(ctx, job)
	}
}

func (s *Service) processPlatformInvoice(ctx context.Context, job db.PlatformCommissionInvoices) {
	fail := func(err error, needsReview bool) {
		retrySeconds := int32(math.Min(3600, 15*math.Pow(2, float64(max(0, job.AttemptCount-1)))))
		if _, markErr := s.queries.MarkPlatformCommissionInvoiceFailed(ctx, db.MarkPlatformCommissionInvoiceFailedParams{
			ID:           job.ID,
			NeedsReview:  needsReview,
			ErrorMessage: pgtype.Text{String: truncateError(err), Valid: true},
			RetrySeconds: retrySeconds,
		}); markErr != nil {
			log.Printf("SPOTTR monthly invoice failure could not be persisted: invoice=%s err=%v", common.UUIDToString(job.ID), markErr)
		}
	}

	data, err := s.queries.GetPlatformCommissionInvoiceIssueData(ctx, job.ID)
	if err != nil {
		fail(fmt.Errorf("load SPOTTR monthly invoice data: %w", err), errors.Is(err, pgx.ErrNoRows))
		return
	}
	if data.Provider != s.platformConfig.Provider {
		fail(errors.New("operatorul de facturare SPOTTR a fost schimbat"), true)
		return
	}
	liveTotals, err := s.queries.GetPlatformCommissionInvoiceLiveTotals(ctx, db.GetPlatformCommissionInvoiceLiveTotalsParams{
		OrganizerID: data.OrganizerID,
		PeriodStart: data.PeriodStart,
		PeriodEnd:   data.PeriodEnd,
	})
	if err != nil {
		fail(fmt.Errorf("revalidate SPOTTR monthly invoice against live Stripe orders: %w", err), false)
		return
	}
	if liveTotals.TransactionCount <= 0 || liveTotals.TotalFeeBani <= 0 {
		fail(errors.New("factura SPOTTR nu mai are tranzactii Stripe live eligibile"), true)
		return
	}
	if liveTotals.TransactionCount != data.TransactionCount || liveTotals.TotalFeeBani != data.TotalFeeBani {
		if err := s.queries.UpdatePlatformCommissionInvoiceTotals(ctx, db.UpdatePlatformCommissionInvoiceTotalsParams{
			ID:               data.ID,
			TransactionCount: liveTotals.TransactionCount,
			TotalFeeBani:     liveTotals.TotalFeeBani,
		}); err != nil {
			fail(fmt.Errorf("refresh SPOTTR monthly invoice totals: %w", err), false)
			return
		}
		data.TransactionCount = liveTotals.TransactionCount
		data.TotalFeeBani = liveTotals.TotalFeeBani
	}
	provider, ok := s.providers[data.Provider]
	if !ok {
		fail(errors.New("operator de facturare SPOTTR necunoscut"), true)
		return
	}
	if !data.PeriodStart.Valid || !data.PeriodEnd.Valid || data.TotalFeeBani <= 0 {
		fail(errors.New("perioada sau totalul facturii SPOTTR este invalid"), true)
		return
	}

	periodStart := data.PeriodStart.Time
	periodEnd := data.PeriodEnd.Time
	periodLastDay := periodEnd.AddDate(0, 0, -1)
	periodLabel := periodStart.Format("02.01.2006") + " - " + periodLastDay.Format("02.01.2006")
	totalRon := float64(data.TotalFeeBani) / 100
	invoiceID := common.UUIDToString(data.ID)
	requestContext, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	result, err := provider.Issue(requestContext, InvoiceRequest{
		InvoiceID:       invoiceID,
		OrderID:         "commission-" + invoiceID,
		IssueDate:       time.Now().In(bucharestLocation()),
		CustomerEmail:   data.OrganizerEmail,
		CustomerType:    "company",
		CustomerName:    data.CompanyName,
		CustomerTaxID:   data.Cui,
		CustomerAddress: data.FiscalAddress,
		CustomerCountry: "Romania",
		EventTitle:      "Servicii platforma si comisioane SPOTTR, perioada " + periodLabel,
		Total:           totalRon,
		Items: []InvoiceItem{{
			Name:      "Servicii platforma si comisioane SPOTTR",
			Code:      "SPOTTR-COMMISSION-" + periodStart.Format("2006-01"),
			Quantity:  1,
			UnitPrice: totalRon,
		}},
		AccountEmail:     s.platformConfig.AccountEmail,
		APIToken:         s.platformConfig.APIToken,
		CompanyVATCode:   s.platformConfig.CompanyVATCode,
		SeriesName:       s.platformConfig.SeriesName,
		VATName:          s.platformConfig.VATName,
		VATPercentage:    s.platformConfig.VATPercentage,
		SendEmail:        s.platformConfig.SendEmail,
		SendToSPV:        s.platformConfig.SendToSPV,
		PaymentType:      s.platformConfig.PaymentType,
		PaymentReference: "Retinere comisioane Stripe " + periodStart.Format("2006-01"),
		InternalNote:     fmt.Sprintf("Comisioane SPOTTR %s, %d tranzactii", periodLabel, data.TransactionCount),
	})
	if err != nil {
		var failure *providerFailure
		fail(err, errors.As(err, &failure) && failure.needsReview)
		return
	}
	if _, err := s.queries.MarkPlatformCommissionInvoiceIssued(ctx, db.MarkPlatformCommissionInvoiceIssuedParams{
		ID:                 job.ID,
		ExternalSeries:     optionalText(result.Series),
		ExternalNumber:     optionalText(result.Number),
		ExternalDocumentID: optionalText(result.DocumentID),
		DocumentUrl:        optionalText(result.DocumentURL),
	}); err != nil {
		log.Printf("issued SPOTTR monthly invoice could not be persisted: invoice=%s provider=%s series=%s number=%s err=%v", invoiceID, data.Provider, result.Series, result.Number, err)
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
	if data.OrderStatus == db.OrderStatusRefunded {
		if _, deleteErr := s.queries.DeleteClaimedBillingInvoice(ctx, job.ID); deleteErr != nil {
			log.Printf("refunded order invoice could not be cancelled: invoice=%s err=%v", common.UUIDToString(job.ID), deleteErr)
		}
		return
	}
	if !data.StripeLivemode.Valid || !data.StripeLivemode.Bool {
		fail(errors.New("factura nu apartine unei plati Stripe live confirmate"), true)
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
	// Provider VAT names are not interchangeable across rates. Never send the
	// organizer's default name together with a different event percentage.
	if data.VatName == "" {
		optionsCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		options, optionsErr := provider.Options(optionsCtx, ProviderConnectionInput{Provider: data.Provider, AccountEmail: data.AccountEmail, CompanyVATCode: data.CompanyVatCode}, string(apiToken))
		cancel()
		if optionsErr != nil {
			fail(optionsErr, false)
			return
		}
		name, resolveErr := resolveEventVATName(options.VATRates, vatPercentage)
		if resolveErr != nil {
			fail(resolveErr, true)
			return
		}
		data.VatName = name
	}
	invoiceItems := make([]InvoiceItem, 0, len(items)+1)
	// Persist before contacting the provider, including on retry, so the ticket
	// PDF and the issued invoice use the same historical VAT selection.
	if err := s.queries.SnapshotOrderInvoiceVAT(ctx, db.SnapshotOrderInvoiceVATParams{
		OrderID: data.OrderID, VatPercentage: data.VatPercentage, VatName: data.VatName,
	}); err != nil {
		fail(err, false)
		return
	}
	for _, item := range items {
		invoiceItems = append(invoiceItems, InvoiceItem{
			Name:      "Bilet " + data.EventTitle + " - " + item.TicketTypeName,
			Code:      "SPOTTR-" + strings.ReplaceAll(common.UUIDToString(item.TicketTypeID), "-", "")[:12],
			Quantity:  item.Quantity,
			UnitPrice: float64(item.UnitPriceRon),
		})
	}
	invoiceItems = appendCustomerTicketingFee(invoiceItems, data.CustomerTicketingFeeBani)
	customerTotalRon := customerInvoiceTotalRon(data.TotalAmount, data.CustomerTicketingFeeBani)

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
		CustomerVATPayer:  strings.HasPrefix(strings.ToUpper(strings.TrimSpace(data.BillingTaxID)), "RO"),
		VATPayerKnown:     data.BillingType != "company" || strings.HasPrefix(strings.ToUpper(strings.TrimSpace(data.BillingTaxID)), "RO"),
		EventTitle:        data.EventTitle,
		Total:             customerTotalRon,
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
		return
	}
	if err := s.QueueOrderRefund(ctx, data.OrderID); err != nil {
		log.Printf("invoice refund could not be queued after issue: order=%s err=%v", common.UUIDToString(data.OrderID), err)
	}
}

func appendCustomerTicketingFee(items []InvoiceItem, feeBani int32) []InvoiceItem {
	if feeBani <= 0 {
		return items
	}
	return append(items, InvoiceItem{
		Name:      "Taxă de ticketing și procesare",
		Code:      "SPOTTR-TICKETING-PROCESSING",
		Quantity:  1,
		UnitPrice: float64(feeBani) / 100,
	})
}

func customerInvoiceTotalRon(ticketTotalRon, customerTicketingFeeBani int32) float64 {
	return float64(ticketTotalRon) + float64(customerTicketingFeeBani)/100
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
