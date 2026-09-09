package invoicing

import (
	"context"
	"time"
)

const (
	ProviderOblio     = "oblio"
	ProviderSmartBill = "smartbill"
)

type SettingsInput struct {
	Provider       string  `json:"provider"`
	Enabled        bool    `json:"enabled"`
	AccountEmail   string  `json:"accountEmail"`
	APIToken       string  `json:"apiToken"`
	CompanyVATCode string  `json:"companyVatCode"`
	SeriesName     string  `json:"seriesName"`
	VATName        string  `json:"vatName"`
	VATPercentage  float64 `json:"vatPercentage"`
	SendEmail      bool    `json:"sendEmail"`
	SendToSPV      bool    `json:"sendToSpv"`
}

type SettingsResponse struct {
	Connected      bool    `json:"connected"`
	Provider       string  `json:"provider,omitempty"`
	Enabled        bool    `json:"enabled"`
	AccountEmail   string  `json:"accountEmail,omitempty"`
	CompanyVATCode string  `json:"companyVatCode,omitempty"`
	SeriesName     string  `json:"seriesName,omitempty"`
	VATName        string  `json:"vatName,omitempty"`
	VATPercentage  float64 `json:"vatPercentage"`
	SendEmail      bool    `json:"sendEmail"`
	SendToSPV      bool    `json:"sendToSpv"`
	CredentialsSet bool    `json:"credentialsConfigured"`
}

type ProviderConnectionInput struct {
	Provider       string `json:"provider"`
	AccountEmail   string `json:"accountEmail"`
	APIToken       string `json:"apiToken,omitempty"`
	CompanyVATCode string `json:"companyVatCode"`
}

type SeriesOption struct {
	Name    string `json:"name"`
	Default bool   `json:"default"`
}

type VATRateOption struct {
	Name       string  `json:"name"`
	Percentage float64 `json:"percentage"`
	Default    bool    `json:"default"`
}

type ProviderOptions struct {
	Series   []SeriesOption  `json:"series"`
	VATRates []VATRateOption `json:"vatRates"`
}

type InvoiceItem struct {
	Name      string
	Code      string
	Quantity  int32
	UnitPrice float64
}

type InvoiceRequest struct {
	InvoiceID         string
	OrderID           string
	PaymentIntentID   string
	IssueDate         time.Time
	CustomerEmail     string
	CustomerType      string
	CustomerName      string
	CustomerTaxID     string
	CustomerRegNumber string
	CustomerAddress   string
	CustomerCity      string
	CustomerCounty    string
	CustomerSector    string
	CustomerCountry   string
	CustomerVATPayer  bool
	VATPayerKnown     bool
	EventTitle        string
	Total             float64
	Items             []InvoiceItem
	AccountEmail      string
	APIToken          string
	CompanyVATCode    string
	SeriesName        string
	VATName           string
	VATPercentage     float64
	SendEmail         bool
	SendToSPV         bool
	PaymentType       string
	PaymentReference  string
	InternalNote      string
}

type InvoiceResult struct {
	Series      string
	Number      string
	DocumentID  string
	DocumentURL string
}

type providerFailure struct {
	err         error
	needsReview bool
}

func (e *providerFailure) Error() string { return e.err.Error() }
func (e *providerFailure) Unwrap() error { return e.err }

type invoiceProvider interface {
	Options(ctx context.Context, input ProviderConnectionInput, apiToken string) (ProviderOptions, error)
	Issue(ctx context.Context, request InvoiceRequest) (InvoiceResult, error)
}

func providerCustomerCity(invoice InvoiceRequest) string {
	if invoice.CustomerSector != "" {
		return invoice.CustomerSector
	}
	return invoice.CustomerCity
}

func invoicePaymentType(invoice InvoiceRequest, fallback string) string {
	if invoice.PaymentType != "" {
		return invoice.PaymentType
	}
	return fallback
}

func invoicePaymentReference(invoice InvoiceRequest) string {
	if invoice.PaymentReference != "" {
		return invoice.PaymentReference
	}
	return invoice.PaymentIntentID
}

func invoiceInternalNote(invoice InvoiceRequest) string {
	if invoice.InternalNote != "" {
		return invoice.InternalNote
	}
	return "Comanda Spottr " + invoice.OrderID
}
