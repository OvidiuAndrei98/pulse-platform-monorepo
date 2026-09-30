package invoicing

import (
	"errors"
	"net/mail"
	"os"
	"strconv"
	"strings"
)

type PlatformInvoiceConfig struct {
	Enabled        bool
	Provider       string
	AccountEmail   string
	APIToken       string
	CompanyVATCode string
	SeriesName     string
	VATName        string
	VATPercentage  float64
	SendEmail      bool
	SendToSPV      bool
	PaymentType    string
}

// PromotionInvoiceConfig is safe to persist as an immutable fiscal snapshot.
// The API token is intentionally excluded; credentials may rotate and remain
// confined to runtime configuration.
type PromotionInvoiceConfig struct {
	Provider       string
	AccountEmail   string
	CompanyVATCode string
	SeriesName     string
	VATName        string
	VATPercentage  float64
	SendEmail      bool
	SendToSPV      bool
	PaymentType    string
}

func (s *Service) PromotionInvoiceConfig() (PromotionInvoiceConfig, error) {
	if s == nil {
		return PromotionInvoiceConfig{}, errors.New("serviciul de facturare SPOTTR nu este disponibil")
	}
	if s.platformConfigErr != nil {
		return PromotionInvoiceConfig{}, s.platformConfigErr
	}
	if !s.platformConfig.Enabled {
		return PromotionInvoiceConfig{}, errors.New("facturarea SPOTTR nu este configurata")
	}
	if !s.platformConfig.SendEmail {
		return PromotionInvoiceConfig{}, errors.New("trimiterea pe email a facturilor SPOTTR trebuie activata pentru promovari")
	}
	return PromotionInvoiceConfig{
		Provider:       s.platformConfig.Provider,
		AccountEmail:   s.platformConfig.AccountEmail,
		CompanyVATCode: s.platformConfig.CompanyVATCode,
		SeriesName:     s.platformConfig.SeriesName,
		VATName:        s.platformConfig.VATName,
		VATPercentage:  s.platformConfig.VATPercentage,
		SendEmail:      s.platformConfig.SendEmail,
		SendToSPV:      s.platformConfig.SendToSPV,
		PaymentType:    s.platformConfig.PaymentType,
	}, nil
}

func loadPlatformInvoiceConfig() (PlatformInvoiceConfig, error) {
	provider := strings.ToLower(strings.TrimSpace(os.Getenv("SPOTTR_INVOICING_PROVIDER")))
	if provider == "" {
		return PlatformInvoiceConfig{}, nil
	}
	if provider != ProviderOblio && provider != ProviderSmartBill {
		return PlatformInvoiceConfig{}, errors.New("SPOTTR_INVOICING_PROVIDER trebuie sa fie oblio sau smartbill")
	}

	sendEmail, err := boolEnvOrDefault("SPOTTR_INVOICING_SEND_EMAIL", true)
	if err != nil {
		return PlatformInvoiceConfig{}, err
	}
	sendToSPV, err := boolEnvOrDefault("SPOTTR_INVOICING_SEND_TO_SPV", true)
	if err != nil {
		return PlatformInvoiceConfig{}, err
	}
	percentage := envOrDefault("SPOTTR_INVOICING_VAT_PERCENTAGE", "21")
	parsedPercentage, err := strconv.ParseFloat(percentage, 64)
	if err != nil || parsedPercentage < 0 || parsedPercentage > 100 {
		return PlatformInvoiceConfig{}, errors.New("SPOTTR_INVOICING_VAT_PERCENTAGE trebuie sa fie intre 0 si 100")
	}
	vatName, vatNameConfigured := os.LookupEnv("SPOTTR_INVOICING_VAT_NAME")
	vatName = strings.TrimSpace(vatName)
	if !vatNameConfigured && parsedPercentage > 0 {
		vatName = "Normala"
	}

	config := PlatformInvoiceConfig{
		Enabled:        true,
		Provider:       provider,
		AccountEmail:   strings.TrimSpace(os.Getenv("SPOTTR_INVOICING_ACCOUNT_EMAIL")),
		APIToken:       strings.TrimSpace(os.Getenv("SPOTTR_INVOICING_API_TOKEN")),
		CompanyVATCode: strings.TrimSpace(os.Getenv("SPOTTR_INVOICING_COMPANY_VAT_CODE")),
		SeriesName:     strings.TrimSpace(os.Getenv("SPOTTR_INVOICING_SERIES_NAME")),
		VATName:        vatName,
		VATPercentage:  parsedPercentage,
		SendEmail:      sendEmail,
		SendToSPV:      sendToSPV,
		PaymentType:    envOrDefault("SPOTTR_INVOICING_PAYMENT_TYPE", "Alta incasare banca"),
	}

	address, err := mail.ParseAddress(config.AccountEmail)
	if err != nil || address.Address != config.AccountEmail {
		return PlatformInvoiceConfig{}, errors.New("SPOTTR_INVOICING_ACCOUNT_EMAIL este invalid")
	}
	if config.APIToken == "" || config.CompanyVATCode == "" || config.SeriesName == "" {
		return PlatformInvoiceConfig{}, errors.New("configuratia de facturare SPOTTR este incompleta")
	}
	return config, nil
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func boolEnvOrDefault(name string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, errors.New(name + " trebuie sa fie true sau false")
	}
	return parsed, nil
}
