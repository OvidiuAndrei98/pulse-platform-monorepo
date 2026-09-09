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
	Verify(ctx context.Context, input SettingsInput, apiToken string) error
	Issue(ctx context.Context, request InvoiceRequest) (InvoiceResult, error)
}

func providerCustomerCity(invoice InvoiceRequest) string {
	if invoice.CustomerSector != "" {
		return invoice.CustomerSector
	}
	return invoice.CustomerCity
}
