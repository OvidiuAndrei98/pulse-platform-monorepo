package invoicing

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestOblioCompanyUsesFiscalAutocompleteWithoutHardcodedVATStatus(t *testing.T) {
	var invoicePayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authorize/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "token"})
		case "/docs/invoice":
			if err := json.NewDecoder(r.Body).Decode(&invoicePayload); err != nil {
				t.Fatal(err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": 200,
				"data":   map[string]any{"seriesName": "FCT", "number": "1"},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := newOblioProvider(server.Client())
	provider.baseURL = server.URL
	if _, err := provider.Issue(context.Background(), invoiceFixture()); err != nil {
		t.Fatal(err)
	}

	client := invoicePayload["client"].(map[string]any)
	if client["autocomplete"] != float64(1) {
		t.Fatalf("autocomplete = %#v, want 1", client["autocomplete"])
	}
	if _, exists := client["vatPayer"]; exists {
		t.Fatal("vatPayer must be omitted when Oblio autocompletes a Romanian company")
	}
}

func TestOblioRefundCreatesLinkedFullStorno(t *testing.T) {
	var refundPayload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/authorize/token":
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "token"})
		case "/docs/invoice":
			if err := json.NewDecoder(r.Body).Decode(&refundPayload); err != nil {
				t.Fatal(err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": 200,
				"data":   map[string]any{"seriesName": "FCT", "number": "2"},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	provider := newOblioProvider(server.Client())
	provider.baseURL = server.URL
	if _, err := provider.Refund(context.Background(), InvoiceRefundRequest{
		OrderID:        "order-1",
		OriginalSeries: "FCT",
		OriginalNumber: "1",
		AccountEmail:   "issuer@example.com",
		APIToken:       "secret",
		CompanyVATCode: "RO87654321",
		SeriesName:     "FCT",
	}); err != nil {
		t.Fatal(err)
	}

	reference := refundPayload["referenceDocument"].(map[string]any)
	if reference["type"] != "Factura" || reference["refund"] != float64(1) || reference["seriesName"] != "FCT" || reference["number"] != "1" {
		t.Fatalf("unexpected reference document: %#v", reference)
	}
	if refundPayload["idempotencyKey"] != "spottr-refund-order-1" {
		t.Fatalf("unexpected idempotency key: %#v", refundPayload["idempotencyKey"])
	}
}

func TestSmartBillSendsKnownVATStatusAndOmitsUnknownStatus(t *testing.T) {
	tests := []struct {
		name       string
		known      bool
		payer      bool
		wantExists bool
	}{
		{name: "registered VAT payer", known: true, payer: true, wantExists: true},
		{name: "known non payer", known: true, payer: false, wantExists: true},
		{name: "unknown status", known: false, payer: false, wantExists: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var invoicePayload map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if err := json.NewDecoder(r.Body).Decode(&invoicePayload); err != nil {
					t.Fatal(err)
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"series": "FCT", "number": "1"})
			}))
			defer server.Close()

			provider := newSmartBillProvider(server.Client())
			provider.baseURL = server.URL
			invoice := invoiceFixture()
			invoice.VATPayerKnown = test.known
			invoice.CustomerVATPayer = test.payer
			if _, err := provider.Issue(context.Background(), invoice); err != nil {
				t.Fatal(err)
			}

			client := invoicePayload["client"].(map[string]any)
			value, exists := client["isTaxPayer"]
			if exists != test.wantExists {
				t.Fatalf("isTaxPayer presence = %v, want %v", exists, test.wantExists)
			}
			if exists && value != test.payer {
				t.Fatalf("isTaxPayer = %#v, want %v", value, test.payer)
			}
		})
	}
}

func TestInvoiceProvidersSendExplicitZeroVAT(t *testing.T) {
	for _, providerName := range []string{"oblio", "smartbill"} {
		t.Run(providerName, func(t *testing.T) {
			var payload map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/authorize/token" {
					_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "fixture"})
					return
				}
				if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
					t.Error(err)
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"status": 200, "data": map[string]any{"seriesName": "FCT", "number": "1"}, "series": "FCT", "number": "1"})
			}))
			defer server.Close()
			fixture := invoiceFixture()
			fixture.VATPercentage = 0
			fixture.VATName = "No VAT"
			var err error
			if providerName == "oblio" {
				p := newOblioProvider(server.Client())
				p.baseURL = server.URL
				_, err = p.Issue(context.Background(), fixture)
			} else {
				p := newSmartBillProvider(server.Client())
				p.baseURL = server.URL
				_, err = p.Issue(context.Background(), fixture)
			}
			if err != nil {
				t.Fatal(err)
			}
			products := payload["products"].([]any)
			product := products[0].(map[string]any)
			key, included := "vatPercentage", "vatIncluded"
			if providerName == "smartbill" {
				key, included = "taxPercentage", "isTaxIncluded"
			}
			value, exists := product[key]
			if !exists || value != float64(0) {
				t.Fatalf("zero VAT omitted: %v", product)
			}
			if product["price"] != float64(100) || (product[included] != true && product[included] != float64(1)) {
				t.Fatalf("tax changed inclusive price: %v", product)
			}
		})
	}
}

func invoiceFixture() InvoiceRequest {
	return InvoiceRequest{
		OrderID:          "order-1",
		IssueDate:        time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC),
		CustomerEmail:    "buyer@example.com",
		CustomerType:     "company",
		CustomerName:     "Buyer SRL",
		CustomerTaxID:    "RO12345678",
		CustomerCountry:  "Romania",
		EventTitle:       "Event",
		Total:            100,
		Items:            []InvoiceItem{{Name: "Ticket", Quantity: 1, UnitPrice: 100}},
		AccountEmail:     "issuer@example.com",
		APIToken:         "secret",
		CompanyVATCode:   "RO87654321",
		SeriesName:       "FCT",
		VATName:          "Normala",
		VATPercentage:    21,
		VATPayerKnown:    true,
		CustomerVATPayer: true,
	}
}
