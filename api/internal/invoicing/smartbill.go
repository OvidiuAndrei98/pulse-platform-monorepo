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
		Name string `json:"name"`
		Type string `json:"type"`
	} `json:"list"`
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

func (p *smartBillProvider) Verify(ctx context.Context, input SettingsInput, apiToken string) error {
	endpoint := p.baseURL + "/series?cif=" + url.QueryEscape(input.CompanyVATCode) + "&type=f"
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	request.SetBasicAuth(input.AccountEmail, apiToken)

	var response smartBillSeriesResponse
	if err := doProviderJSON(p.client, request, &response); err != nil {
		return fmt.Errorf("SmartBill series verification failed: %w", err)
	}
	if response.ErrorText != "" {
		return errors.New(response.ErrorText)
	}
	for _, series := range response.List {
		if series.Type == "f" && series.Name == input.SeriesName {
			return nil
		}
	}
	return fmt.Errorf("seria de factura %q nu exista in contul SmartBill", input.SeriesName)
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
		"client": map[string]any{
			"name":     invoice.CustomerName,
			"vatCode":  invoice.CustomerTaxID,
			"regCom":   invoice.CustomerRegNumber,
			"address":  invoice.CustomerAddress,
			"city":     providerCustomerCity(invoice),
			"county":   invoice.CustomerCounty,
			"country":  invoice.CustomerCountry,
			"email":    invoice.CustomerEmail,
			"saveToDb": false,
		},
		"products": products,
		"payment": map[string]any{
			"value":  invoice.Total,
			"type":   "Card online",
			"isCash": false,
		},
		"sendEmail": invoice.SendEmail,
		"email": map[string]string{
			"to": invoice.CustomerEmail,
		},
		"observations": "Comanda Spottr " + invoice.OrderID,
		"mentions":     "Plata online Stripe " + invoice.PaymentIntentID,
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
