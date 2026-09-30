package invoicing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const smartBillBaseURL = "https://ws.smartbill.ro/SBORO/api"

type smartBillProvider struct {
	client  *http.Client
	baseURL string
}

type smartBillSeriesResponse struct {
	ErrorText string `json:"errorText"`
	List      []struct {
		Name      string `json:"name"`
		Type      string `json:"type"`
		Default   bool   `json:"default"`
		IsDefault bool   `json:"isDefault"`
	} `json:"list"`
}

type smartBillTaxResponse struct {
	ErrorText string `json:"errorText"`
	Taxes     []struct {
		Name       string  `json:"name"`
		Percentage float64 `json:"percentage"`
		Default    bool    `json:"default"`
		IsDefault  bool    `json:"isDefault"`
	} `json:"taxes"`
}

type smartBillInvoiceResponse struct {
	ErrorText       string `json:"errorText"`
	Message         string `json:"message"`
	Number          string `json:"number"`
	Series          string `json:"series"`
	DocumentURL     string `json:"documentUrl"`
	DocumentID      int64  `json:"documentId"`
	DocumentViewURL string `json:"documentViewUrl"`
}

func newSmartBillProvider(client *http.Client) *smartBillProvider {
	return &smartBillProvider{client: client, baseURL: smartBillBaseURL}
}

func (p *smartBillProvider) Options(ctx context.Context, input ProviderConnectionInput, apiToken string) (ProviderOptions, error) {
	var seriesResponse smartBillSeriesResponse
	if err := p.getConfiguration(ctx, input, apiToken, "/series", "&type=f", &seriesResponse); err != nil {
		return ProviderOptions{}, fmt.Errorf("SmartBill series verification failed: %w", err)
	}
	if strings.TrimSpace(seriesResponse.ErrorText) != "" {
		return ProviderOptions{}, errors.New(seriesResponse.ErrorText)
	}

	options := ProviderOptions{Series: make([]SeriesOption, 0), VATRates: make([]VATRateOption, 0)}
	for _, series := range seriesResponse.List {
		if strings.EqualFold(series.Type, "f") {
			options.Series = append(options.Series, SeriesOption{Name: series.Name, Default: series.Default || series.IsDefault})
		}
	}

	var taxResponse smartBillTaxResponse
	if err := p.getConfiguration(ctx, input, apiToken, "/tax", "", &taxResponse); err != nil {
		return ProviderOptions{}, fmt.Errorf("SmartBill VAT rates verification failed: %w", err)
	}
	if strings.TrimSpace(taxResponse.ErrorText) != "" {
		return ProviderOptions{}, errors.New(taxResponse.ErrorText)
	}
	for _, rate := range taxResponse.Taxes {
		options.VATRates = append(options.VATRates, VATRateOption{Name: rate.Name, Percentage: rate.Percentage, Default: rate.Default || rate.IsDefault})
	}
	return normalizeProviderOptions(options), nil
}

func (p *smartBillProvider) Issue(ctx context.Context, invoice InvoiceRequest) (InvoiceResult, error) {
	type product struct {
		Name               string  `json:"name"`
		Code               string  `json:"code,omitempty"`
		ProductDescription string  `json:"productDescription,omitempty"`
		Quantity           int32   `json:"quantity"`
		Price              float64 `json:"price"`
		MeasuringUnitName  string  `json:"measuringUnitName"`
		TaxName            string  `json:"taxName,omitempty"`
		TaxPercentage      float64 `json:"taxPercentage"`
		IsTaxIncluded      bool    `json:"isTaxIncluded"`
		IsService          bool    `json:"isService"`
		SaveToDB           bool    `json:"saveToDb"`
	}
	products := make([]product, 0, len(invoice.Items))
	for _, item := range invoice.Items {
		products = append(products, product{
			Name:               item.Name,
			Code:               item.Code,
			ProductDescription: invoice.EventTitle,
			Quantity:           item.Quantity,
			Price:              item.UnitPrice,
			MeasuringUnitName:  "buc",
			TaxName:            invoice.VATName,
			TaxPercentage:      invoice.VATPercentage,
			IsTaxIncluded:      true,
			IsService:          true,
			SaveToDB:           false,
		})
	}

	client := map[string]any{
		"name":     invoice.CustomerName,
		"vatCode":  invoice.CustomerTaxID,
		"regCom":   invoice.CustomerRegNumber,
		"address":  invoice.CustomerAddress,
		"city":     providerCustomerCity(invoice),
		"county":   invoice.CustomerCounty,
		"country":  invoice.CustomerCountry,
		"email":    invoice.CustomerEmail,
		"saveToDb": false,
	}
	if invoice.VATPayerKnown {
		client["isTaxPayer"] = invoice.CustomerVATPayer
	}

	payload := map[string]any{
		"companyVatCode": invoice.CompanyVATCode,
		"seriesName":     invoice.SeriesName,
		"isDraft":        false,
		"issueDate":      invoice.IssueDate.Format("2006-01-02"),
		"dueDate":        invoice.IssueDate.Format("2006-01-02"),
		"paymentDate":    invoice.IssueDate.Format("2006-01-02"),
		"language":       "RO",
		"currency":       "RON",
		"precision":      2,
		"useStock":       false,
		"client":         client,
		"products":       products,
		"payment": map[string]any{
			"value":  invoice.Total,
			"type":   invoicePaymentType(invoice, "Card online"),
			"isCash": false,
		},
		"sendEmail": invoice.SendEmail,
		"email": map[string]string{
			"to": invoice.CustomerEmail,
		},
		"observations": invoiceInternalNote(invoice),
		"mentions":     invoicePaymentReference(invoice),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return InvoiceResult{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/invoice/v2", bytes.NewReader(body))
	if err != nil {
		return InvoiceResult{}, err
	}
	request.SetBasicAuth(invoice.AccountEmail, invoice.APIToken)
	request.Header.Set("Content-Type", "application/json")

	var response smartBillInvoiceResponse
	if err := doProviderJSON(p.client, request, &response); err != nil {
		// SmartBill does not expose an idempotency key for invoice creation. A
		// transport/5xx error can be ambiguous, so automatic retry could duplicate it.
		return InvoiceResult{}, &providerFailure{err: fmt.Errorf("SmartBill invoice response is ambiguous: %w", err), needsReview: true}
	}
	if strings.TrimSpace(response.ErrorText) != "" {
		return InvoiceResult{}, &providerFailure{err: errors.New(response.ErrorText), needsReview: true}
	}
	if response.Number == "" {
		return InvoiceResult{}, &providerFailure{err: errors.New("SmartBill nu a returnat numarul facturii"), needsReview: true}
	}
	documentURL := response.DocumentViewURL
	if documentURL == "" {
		documentURL = response.DocumentURL
	}
	return InvoiceResult{
		Series:      response.Series,
		Number:      response.Number,
		DocumentID:  strconv.FormatInt(response.DocumentID, 10),
		DocumentURL: documentURL,
	}, nil
}

func (p *smartBillProvider) Refund(_ context.Context, _ InvoiceRefundRequest) (InvoiceResult, error) {
	// SmartBill's public API does not document a linked full-storno endpoint.
	// Creating a normal invoice with negative lines would not be recorded as a
	// proper storno of the original document, so require accounting review.
	return InvoiceResult{}, &providerFailure{
		err:         errors.New("Factura SmartBill trebuie stornata din SmartBill; API-ul public nu documenteaza stornarea legata de factura originala"),
		needsReview: true,
	}
}

func (p *smartBillProvider) getConfiguration(ctx context.Context, input ProviderConnectionInput, apiToken, path, extraQuery string, target any) error {
	endpoint := p.baseURL + path + "?cif=" + url.QueryEscape(input.CompanyVATCode) + extraQuery
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	request.SetBasicAuth(input.AccountEmail, apiToken)
	return doProviderJSON(p.client, request, target)
}
