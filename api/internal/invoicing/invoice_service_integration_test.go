package invoicing

import (
	"context"
	"encoding/base64"
	"fmt"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "pulse-api/db/generated"
	"sync"
	"testing"
	"time"
)

type invoiceServiceProviderFake struct{ promotionInvoiceProviderFake }

func (f *invoiceServiceProviderFake) Options(context.Context, ProviderConnectionInput, string) (ProviderOptions, error) {
	return ProviderOptions{Series: []SeriesOption{{Name: "TEST"}}, VATRates: []VATRateOption{{Name: "Zero", Percentage: 0}}}, nil
}

func seedInvoiceService(t *testing.T) (*Service, *pgxpool.Pool, pgtype.UUID, pgtype.UUID) {
	t.Helper()
	pool := promotionInvoiceTestPool(t)
	ctx := context.Background()
	suffix := fmt.Sprint(time.Now().UnixNano())
	var organizer, event pgtype.UUID
	must := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	must(pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'unused','organizer',TRUE) RETURNING id`, "invoice-"+suffix, "invoice-"+suffix+"@example.invalid").Scan(&organizer))
	_, err := pool.Exec(ctx, `INSERT INTO organizer_profiles(user_id,cui,company_name,fiscal_address,verification_status,stripe_account_id,stripe_charges_enabled) VALUES($1,$2,'Invoice Test','Test','approved',$3,TRUE)`, organizer, "T"+suffix, "acct_invoice_"+suffix)
	must(err)
	must(pool.QueryRow(ctx, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status) VALUES($1,'Invoice test','house','Venue','Bucuresti','social',44,26,clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days',$2,'published') RETURNING id`, organizer, "invoice-"+suffix).Scan(&event))
	_, err = pool.Exec(ctx, `INSERT INTO organizer_invoicing_settings(organizer_id,provider,enabled,account_email,credentials_encrypted,company_vat_code,series_name,vat_name,vat_percentage,send_email,send_to_spv) VALUES($1,'oblio',TRUE,'test@example.invalid','test'::bytea,'RO123','TEST','Zero',0,TRUE,FALSE)`, organizer)
	must(err)
	_, err = pool.Exec(ctx, `INSERT INTO organizer_invoice_service(organizer_id,free_used) VALUES($1,19)`, organizer)
	must(err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM orders WHERE event_id=$1`, event)
		_, _ = pool.Exec(context.Background(), `DELETE FROM events WHERE id=$1`, event)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, organizer)
	})
	return &Service{pool: pool, queries: db.New(pool), wake: make(chan struct{}, 1)}, pool, organizer, event
}

func serviceJob(t *testing.T, s *Service, organizer, event pgtype.UUID, fee int32) db.BillingInvoices {
	t.Helper()
	ctx := context.Background()
	job := db.BillingInvoices{OrganizerID: organizer, Provider: "oblio", AttemptCount: 1}
	state := "none"
	if fee > 0 {
		state = "held"
	}
	err := s.pool.QueryRow(ctx, `INSERT INTO orders(user_id,event_id,email,total_amount,platform_fee_bani,invoice_service_fee_bani,invoice_service_fee_state,status,stripe_livemode,completed_at) VALUES($1,$2,'test@example.invalid',100,700,$3,$4,'completed',TRUE,clock_timestamp()) RETURNING id`, organizer, event, fee, state).Scan(&job.OrderID)
	if err != nil {
		t.Fatal(err)
	}
	err = s.pool.QueryRow(ctx, `INSERT INTO billing_invoices(order_id,organizer_id,provider,status,claim_token,attempt_count) VALUES($1,$2,'oblio','processing',gen_random_uuid(),1) RETURNING id,claim_token`, job.OrderID, organizer).Scan(&job.ID, &job.ClaimToken)
	if err != nil {
		t.Fatal(err)
	}
	return job
}

func TestAutomaticInvoicingContinuesBeyondTwentyWithoutConsent(t *testing.T) {
	s, pool, org, event := seedInvoiceService(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE organizer_invoice_service SET free_used=20 WHERE organizer_id=$1`, org); err != nil {
		t.Fatal(err)
	}
	jobs := make([]db.BillingInvoices, 25)
	for i := range jobs {
		jobs[i] = serviceJob(t, s, org, event, 0)
	}
	var wg sync.WaitGroup
	errs := make(chan error, len(jobs))
	for _, job := range jobs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			started, err := s.beginInvoiceDispatch(ctx, job)
			if err == nil && !started {
				err = fmt.Errorf("invoice blocked by retired quota")
			}
			if err == nil {
				err = s.finishInvoiceDispatch(ctx, job, InvoiceResult{Series: "T", Number: "25"})
			}
			if err != nil {
				errs <- err
			}
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	settings, err := s.GetSettings(ctx, org)
	if err != nil || !settings.Enabled {
		t.Fatalf("invoicing was paused: %+v %v", settings, err)
	}
	var count, fees int
	if err = pool.QueryRow(ctx, `SELECT count(*),COALESCE(sum(fee_bani),0) FROM invoice_service_usage WHERE organizer_id=$1 AND state='issued'`, org).Scan(&count, &fees); err != nil {
		t.Fatal(err)
	}
	if count != 25 || fees != 0 {
		t.Fatalf("issued=%d fees=%d", count, fees)
	}
}

func TestFreeInvoiceDispatchStillPreventsDuplicatesAndAmbiguousRetries(t *testing.T) {
	s, pool, org, event := seedInvoiceService(t)
	ctx := context.Background()
	job := serviceJob(t, s, org, event, 0)
	results := make(chan bool, 6)
	errs := make(chan error, 6)
	var wg sync.WaitGroup
	for range 6 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			started, err := s.beginInvoiceDispatch(ctx, job)
			results <- started
			errs <- err
		}()
	}
	wg.Wait()
	close(results)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	started := 0
	for result := range results {
		if result {
			started++
		}
	}
	if started != 1 {
		t.Fatalf("same invoice dispatched %d times", started)
	}
	if err := s.failInvoiceDispatch(ctx, job, fmt.Errorf("provider response lost"), true, 60); err != nil {
		t.Fatal(err)
	}
	if _, err := s.queries.RetryBillingInvoice(ctx, db.RetryBillingInvoiceParams{ID: job.ID, OrganizerID: org}); err == nil {
		t.Fatal("ambiguous invoice was retried")
	}
	// A delayed successful response may complete its own claim, exactly once.
	for range 2 {
		if err := s.finishInvoiceDispatch(ctx, job, InvoiceResult{Series: "T", Number: "1"}); err != nil {
			t.Fatal(err)
		}
	}
	var state string
	if err := pool.QueryRow(ctx, `SELECT state FROM invoice_service_usage WHERE invoice_id=$1`, job.ID).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != "issued" {
		t.Fatalf("late completion left journal in %s", state)
	}
}

func TestFreeInvoicingRequiresConfirmedLivePaymentAndRespectsDisable(t *testing.T) {
	for _, tc := range []struct {
		name, status  string
		live, enabled bool
	}{
		{"unpaid", "pending", true, true}, {"failed", "failed", true, true},
		{"refunded", "refunded", true, true}, {"test mode", "completed", false, true},
		{"disabled", "completed", true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, pool, org, event := seedInvoiceService(t)
			ctx := context.Background()
			job := serviceJob(t, s, org, event, 0)
			if _, err := pool.Exec(ctx, `UPDATE orders SET status=$2,stripe_livemode=$3 WHERE id=$1`, job.OrderID, tc.status, tc.live); err != nil {
				t.Fatal(err)
			}
			if _, err := pool.Exec(ctx, `UPDATE organizer_invoicing_settings SET enabled=$2 WHERE organizer_id=$1`, org, tc.enabled); err != nil {
				t.Fatal(err)
			}
			if started, _ := s.beginInvoiceDispatch(ctx, job); started {
				t.Fatal("ineligible order dispatched")
			}
		})
	}
}

func TestFreeInvoicingCanBeEnabledAfterOldTrialOrProviderReconnect(t *testing.T) {
	s, pool, org, _ := seedInvoiceService(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE organizer_profiles SET cui='123456',is_verified=TRUE WHERE user_id=$1`, org); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE organizer_invoice_service SET free_used=20 WHERE organizer_id=$1`, org); err != nil {
		t.Fatal(err)
	}
	var err error
	s.cipher, err = newCredentialCipher(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err != nil {
		t.Fatal(err)
	}
	s.providers = map[string]invoiceProvider{"oblio": &invoiceServiceProviderFake{}, "smartbill": &invoiceServiceProviderFake{}}
	for _, provider := range []string{"oblio", "smartbill"} {
		if err := s.DeleteSettings(ctx, org); err != nil {
			t.Fatal(err)
		}
		for _, enabled := range []bool{true, false, true} {
			result, err := s.SaveSettings(ctx, org, SettingsInput{Provider: provider, Enabled: enabled, AccountEmail: "test@example.invalid", APIToken: "fixture-only", CompanyVATCode: "RO123456", SeriesName: "TEST", VATName: "Zero", VATPercentage: 0})
			if err != nil || result.Enabled != enabled {
				t.Fatalf("enabled=%v response=%+v err=%v", enabled, result, err)
			}
		}
	}
}

func TestHistoricalInvoiceFeeMonthlySettlement(t *testing.T) {
	s, pool, org, event := seedInvoiceService(t)
	ctx := context.Background()
	job := serviceJob(t, s, org, event, 50)
	_, err := pool.Exec(ctx, `UPDATE orders SET platform_fee_status='earned',completed_at='2026-09-15T20:00:00Z' WHERE id=$1`, job.OrderID)
	if err != nil {
		t.Fatal(err)
	}
	var invoiceID pgtype.UUID
	err = pool.QueryRow(ctx, `INSERT INTO platform_commission_invoices(organizer_id,period_start,period_end,provider,transaction_count,total_fee_bani) VALUES($1,'2026-09-01','2026-10-01','oblio',1,700) RETURNING id`, org).Scan(&invoiceID)
	if err != nil {
		t.Fatal(err)
	}
	fake := &promotionInvoiceProviderFake{result: InvoiceResult{Series: "T", Number: "1"}}
	s.providers = map[string]invoiceProvider{"oblio": fake}
	s.platformConfig = PlatformInvoiceConfig{Enabled: true, Provider: "oblio"}
	monthly := db.PlatformCommissionInvoices{ID: invoiceID, AttemptCount: 1}
	s.processPlatformInvoice(ctx, monthly)
	if fake.calls != 0 {
		t.Fatal("invoiced an unsettled service fee")
	}
	_, err = pool.Exec(ctx, `UPDATE orders SET invoice_service_fee_state='earned' WHERE id=$1`, job.OrderID)
	if err != nil {
		t.Fatal(err)
	}
	s.processPlatformInvoice(ctx, monthly)
	if fake.calls != 1 || fake.request.Total != 7 || len(fake.request.Items) != 2 || fake.request.Items[0].UnitPrice != 6.5 || fake.request.Items[1].UnitPrice != 0.5 || fake.request.Items[1].Quantity != 1 {
		t.Fatalf("wrong monthly split: %+v", fake.request)
	}
}
