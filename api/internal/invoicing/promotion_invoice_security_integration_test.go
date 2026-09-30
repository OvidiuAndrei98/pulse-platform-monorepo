package invoicing

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"testing"
	"time"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type promotionInvoiceProviderFake struct {
	calls   int
	request InvoiceRequest
	result  InvoiceResult
	err     error
	after   func(InvoiceRequest)
}

func (f *promotionInvoiceProviderFake) Options(context.Context, ProviderConnectionInput, string) (ProviderOptions, error) {
	return ProviderOptions{}, nil
}

func (f *promotionInvoiceProviderFake) Issue(_ context.Context, request InvoiceRequest) (InvoiceResult, error) {
	f.calls++
	f.request = request
	if f.after != nil {
		f.after(request)
	}
	return f.result, f.err
}

func (f *promotionInvoiceProviderFake) Refund(context.Context, InvoiceRefundRequest) (InvoiceResult, error) {
	return InvoiceResult{}, errors.New("not implemented by promotion invoice test fake")
}

func promotionInvoiceTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("ISOLATION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set ISOLATION_TEST_DATABASE_URL to a migrated local spottr_security_test database")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if config.ConnConfig.Host != "127.0.0.1" || config.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated promotion invoice test database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func seedPromotionInvoiceJob(t *testing.T, pool *pgxpool.Pool, live bool) pgtype.UUID {
	t.Helper()
	var id pgtype.UUID
	suffix := time.Now().UnixNano()
	err := pool.QueryRow(context.Background(), `INSERT INTO promotion_invoices(
campaign_id,organizer_id,event_id,payment_intent_id,stripe_livemode,provider,
issuer_account_email,issuer_company_vat_code,issuer_series_name,vat_name,vat_percentage,
send_email,send_to_spv,payment_type,customer_email,billing_type,billing_name,billing_tax_id,
billing_registration_number,billing_address,billing_city,billing_county,billing_sector,
billing_country,event_title,plan,placement,starts_at,ends_at,amount_bani)
VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),$1,$2,'oblio',
'fiscal@spottr.invalid','RO123456','SPT','Normala',21,TRUE,TRUE,'Card',
'buyer@example.invalid','company','Snapshot Buyer SRL','RO999','J00/1/2026',
'Snapshot Street 1','Cluj-Napoca','Cluj','','Romania','Snapshot Event','one_day','feed',
clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days',5000)
RETURNING id`, fmt.Sprintf("pi_invoice_worker_%d", suffix), live).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), "DELETE FROM promotion_invoices WHERE id=$1", id) })
	return id
}

func promotionInvoiceTestService(pool *pgxpool.Pool, provider invoiceProvider) *Service {
	return &Service{
		queries: db.New(pool),
		pool:    pool,
		providers: map[string]invoiceProvider{
			ProviderOblio: provider,
		},
		platformConfig: PlatformInvoiceConfig{
			Enabled: true, Provider: ProviderOblio, AccountEmail: "fiscal@spottr.invalid",
			APIToken: "rotatable-runtime-token", CompanyVATCode: "RO123456", SeriesName: "SPT",
			VATName: "Normala", VATPercentage: 21, SendEmail: true, SendToSPV: true, PaymentType: "Card",
		},
		wake: make(chan struct{}, 1),
	}
}

func claimPromotionInvoiceJob(t *testing.T, service *Service, id pgtype.UUID) db.PromotionInvoices {
	t.Helper()
	jobs, err := service.queries.ClaimPromotionInvoices(context.Background(), 20)
	if err != nil {
		t.Fatal(err)
	}
	for _, job := range jobs {
		if job.ID == id {
			return job
		}
	}
	t.Fatalf("promotion invoice %v was not claimed", id)
	return db.PromotionInvoices{}
}

func TestPromotionInvoiceWorkerUsesImmutableSnapshotAndExactPaidTotal(t *testing.T) {
	pool := promotionInvoiceTestPool(t)
	id := seedPromotionInvoiceJob(t, pool, true)
	fake := &promotionInvoiceProviderFake{result: InvoiceResult{Series: "SPT", Number: "42", DocumentID: "doc-42", DocumentURL: "https://invoice.invalid/42"}}
	service := promotionInvoiceTestService(pool, fake)
	service.processPromotionInvoice(context.Background(), claimPromotionInvoiceJob(t, service, id))

	if fake.calls != 1 {
		t.Fatalf("provider calls=%d, want 1", fake.calls)
	}
	request := fake.request
	if request.CustomerName != "Snapshot Buyer SRL" || request.CustomerAddress != "Snapshot Street 1" ||
		request.CustomerTaxID != "RO999" || request.CustomerEmail != "buyer@example.invalid" {
		t.Fatalf("billing snapshot changed in dispatch: %+v", request)
	}
	if math.Abs(request.Total-50) > 0.0001 || len(request.Items) != 1 || math.Abs(request.Items[0].UnitPrice-50) > 0.0001 {
		t.Fatalf("invoice total does not match payment: total=%v items=%+v", request.Total, request.Items)
	}
	if !request.SendEmail || !request.SendToSPV || request.PaymentIntentID == "" || request.PaymentReference != request.PaymentIntentID {
		t.Fatalf("invoice delivery/payment evidence missing: %+v", request)
	}
	var status, number string
	if err := pool.QueryRow(context.Background(), "SELECT status, external_number FROM promotion_invoices WHERE id=$1", id).Scan(&status, &number); err != nil {
		t.Fatal(err)
	}
	if status != "issued" || number != "42" {
		t.Fatalf("invoice state=%q number=%q", status, number)
	}
}

func TestPromotionInvoiceWorkerBlocksWrongModeAndChangedIssuer(t *testing.T) {
	tests := []struct {
		name          string
		live          bool
		changeService func(*Service)
	}{
		{name: "test mode", live: false},
		{name: "issuer changed", live: true, changeService: func(service *Service) { service.platformConfig.CompanyVATCode = "RO-DIFFERENT" }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			pool := promotionInvoiceTestPool(t)
			id := seedPromotionInvoiceJob(t, pool, test.live)
			fake := &promotionInvoiceProviderFake{}
			service := promotionInvoiceTestService(pool, fake)
			if test.changeService != nil {
				test.changeService(service)
			}
			service.processPromotionInvoice(context.Background(), claimPromotionInvoiceJob(t, service, id))
			if fake.calls != 0 {
				t.Fatalf("provider called %d times", fake.calls)
			}
			assertPromotionInvoiceStatus(t, pool, id, "needs_review")
		})
	}
}

func TestPromotionInvoiceProviderErrorAfterDispatchRequiresReview(t *testing.T) {
	pool := promotionInvoiceTestPool(t)
	id := seedPromotionInvoiceJob(t, pool, true)
	fake := &promotionInvoiceProviderFake{err: context.DeadlineExceeded}
	service := promotionInvoiceTestService(pool, fake)
	service.processPromotionInvoice(context.Background(), claimPromotionInvoiceJob(t, service, id))
	if fake.calls != 1 {
		t.Fatalf("provider calls=%d, want 1", fake.calls)
	}
	assertPromotionInvoiceStatus(t, pool, id, "needs_review")
	jobs, err := service.queries.ClaimPromotionInvoices(context.Background(), 20)
	if err != nil {
		t.Fatal(err)
	}
	for _, job := range jobs {
		if job.ID == id {
			t.Fatal("ambiguous provider result was automatically reclaimed")
		}
	}
}

func TestPromotionInvoiceProviderSuccessWithLostPersistenceIsNeverReissued(t *testing.T) {
	pool := promotionInvoiceTestPool(t)
	id := seedPromotionInvoiceJob(t, pool, true)
	fake := &promotionInvoiceProviderFake{result: InvoiceResult{Series: "SPT", Number: "43"}}
	fake.after = func(InvoiceRequest) {
		if _, err := pool.Exec(context.Background(), "UPDATE promotion_invoices SET claim_token=gen_random_uuid() WHERE id=$1", id); err != nil {
			t.Errorf("could not simulate lost persistence ownership: %v", err)
		}
	}
	service := promotionInvoiceTestService(pool, fake)
	service.processPromotionInvoice(context.Background(), claimPromotionInvoiceJob(t, service, id))
	if fake.calls != 1 {
		t.Fatalf("provider calls=%d, want 1", fake.calls)
	}
	assertPromotionInvoiceStatus(t, pool, id, "dispatching")
	if _, err := pool.Exec(context.Background(), "UPDATE promotion_invoices SET updated_at=clock_timestamp()-interval '11 minutes' WHERE id=$1", id); err != nil {
		t.Fatal(err)
	}
	if _, err := service.queries.MarkStalePromotionInvoiceDispatchesForReview(context.Background()); err != nil {
		t.Fatal(err)
	}
	assertPromotionInvoiceStatus(t, pool, id, "needs_review")
	jobs, err := service.queries.ClaimPromotionInvoices(context.Background(), 20)
	if err != nil {
		t.Fatal(err)
	}
	for _, job := range jobs {
		if job.ID == id {
			t.Fatal("provider-success/database-failure invoice was automatically reissued")
		}
	}
	if fake.calls != 1 {
		t.Fatalf("provider calls=%d after reconciliation, want 1", fake.calls)
	}
}

func assertPromotionInvoiceStatus(t *testing.T, pool *pgxpool.Pool, id pgtype.UUID, want string) {
	t.Helper()
	var status string
	if err := pool.QueryRow(context.Background(), "SELECT status FROM promotion_invoices WHERE id=$1", id).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != want {
		t.Fatalf("invoice status=%q, want %q", status, want)
	}
}
