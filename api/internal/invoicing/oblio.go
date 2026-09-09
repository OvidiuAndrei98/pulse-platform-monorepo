package invoicing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const oblioBaseURL = "https://www.oblio.eu/api"

type oblioProvider struct {
	client  *http.Client
	baseURL string
}

type oblioTokenResponse struct {
	AccessToken string `json:"access_token"`
	Message     string `json:"statusMessage"`
}

type oblioSeriesResponse struct {
	Status        int    `json:"status"`
	StatusMessage string `json:"statusMessage"`
	Data          []struct {
		Type string `json:"type"`
		Name string `json:"name"`
	} `json:"data"`
}

type oblioInvoiceResponse struct {
	Status        int    `json:"status"`
	StatusMessage string `json:"statusMessage"`
	Data          struct {
		SeriesName string `json:"seriesName"`
		Number     string `json:"number"`
		Link       string `json:"link"`
	} `json:"data"`
}

func newOblioProvider(client *http.Client) *oblioProvider {
	return &oblioProvider{client: client, baseURL: oblioBaseURL}
}

func (p *oblioProvider) Verify(ctx context.Context, input SettingsInput, apiToken string) error {
	token, err := p.authorize(ctx, input.AccountEmail, apiToken)
	if err != nil {
		return err
	}

	endpoint := p.baseURL + "/nomenclature/series?cif=" + url.QueryEscape(input.CompanyVATCode)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+token)

	var response oblioSeriesResponse
	if err := doProviderJSON(p.client, request, &response); err != nil {
		return fmt.Errorf("Oblio series verification failed: %w", err)
	}
	for _, series := range response.Data {
		if strings.EqualFold(series.Type, "Factura") && series.Name == input.SeriesName {
			return nil
		}
	}
	return fmt.Errorf("seria de factura %q nu exista in contul Oblio", input.SeriesName)
}

func (p *oblioProvider) Issue(ctx context.Context, invoice InvoiceRequest) (InvoiceResult, error) {
	token, err := p.authorize(ctx, invoice.AccountEmail, invoice.APIToken)
	if err != nil {
		return InvoiceResult{}, &providerFailure{err: err, needsReview: true}
	}

	type product struct {
		Name          string  `json:"name"`
		Code          string  `json:"code,omitempty"`
		Description   string  `json:"description,omitempty"`
		Price         float64 `json:"price"`
		MeasuringUnit string  `json:"measuringUnit"`
		VATName       string  `json:"vatName"`
		VATPercentage float64 `json:"vatPercentage"`
		VATIncluded   int     `json:"vatIncluded"`
		Quantity      int32   `json:"quantity"`
		ProductType   string  `json:"productType"`
		Save          int     `json:"save"`
	}
	products := make([]product, 0, len(invoice.Items))
	for _, item := range invoice.Items {
		products = append(products, product{
			Name:          item.Name,
			Code:          item.Code,
			Description:   invoice.EventTitle,
			Price:         item.UnitPrice,
			MeasuringUnit: "buc",
			VATName:       invoice.VATName,
			VATPercentage: invoice.VATPercentage,
			VATIncluded:   1,
			Quantity:      item.Quantity,
			ProductType:   "Serviciu",
			Save:          0,
		})
	}

	payload := map[string]any{
		"cif": invoice.CompanyVATCode,
		"client": map[string]any{
			"cif":      invoice.CustomerTaxID,
			"name":     invoice.CustomerName,
			"rc":       invoice.CustomerRegNumber,
			"address":  invoice.CustomerAddress,
			"state":    invoice.CustomerCounty,
			"city":     providerCustomerCity(invoice),
			"country":  invoice.CustomerCountry,
			"email":    invoice.CustomerEmail,
			"vatPayer": false,
			"save":     0,
		},
		"issueDate":   invoice.IssueDate.Format("2006-01-02"),
		"dueDate":     invoice.IssueDate.Format("2006-01-02"),
		"collectDate": invoice.IssueDate.Format("2006-01-02"),
		"seriesName":  invoice.SeriesName,
		"language":    "RO",
		"precision":   2,
		"currency":    "RON",
		"products":    products,
		"collect": map[string]any{
			"type":           "Card",
			"documentNumber": invoice.PaymentIntentID,
			"value":          invoice.Total,
			"issueDate":      invoice.IssueDate.Format("2006-01-02"),
		},
		"sendEmail":      boolInt(invoice.SendEmail),
		"spvExtern":      boolInt(invoice.SendToSPV),
		"orderNumber":    invoice.OrderID,
		"internalNote":   "Comanda Spottr " + invoice.OrderID,
		"idempotencyKey": "spottr-order-" + invoice.OrderID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return InvoiceResult{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/docs/invoice", bytes.NewReader(body))
	if err != nil {
		return InvoiceResult{}, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")

	var response oblioInvoiceResponse
	if err := doProviderJSON(p.client, request, &response); err != nil {
		// Oblio's idempotencyKey makes retrying transport errors safe.
		return InvoiceResult{}, &providerFailure{err: fmt.Errorf("Oblio invoice failed: %w", err)}
	}
	if response.Status != http.StatusOK || response.Data.Number == "" {
		message := strings.TrimSpace(response.StatusMessage)
		if message == "" {
			message = "Oblio nu a returnat numarul facturii"
		}
		return InvoiceResult{}, &providerFailure{err: errors.New(message), needsReview: true}
	}
	return InvoiceResult{
		Series:      response.Data.SeriesName,
		Number:      response.Data.Number,
		DocumentURL: response.Data.Link,
	}, nil
}

func (p *oblioProvider) authorize(ctx context.Context, email, secret string) (string, error) {
	form := url.Values{}
	form.Set("client_id", email)
	form.Set("client_secret", secret)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/authorize/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	var response oblioTokenResponse
	if err := doProviderJSON(p.client, request, &response); err != nil {
		return "", fmt.Errorf("autentificarea Oblio a esuat: %w", err)
	}
	if response.AccessToken == "" {
		if response.Message == "" {
			response.Message = "credentialele Oblio nu sunt valide"
		}
		return "", errors.New(response.Message)
	}
	return response.AccessToken, nil
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func doProviderJSON(client *http.Client, request *http.Request, target any) error {
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message, _ := io.ReadAll(io.LimitReader(response.Body, 16<<10))
		return fmt.Errorf("HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(message)))
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(target); err != nil {
		return fmt.Errorf("decode provider response: %w", err)
	}
	return nil
}
