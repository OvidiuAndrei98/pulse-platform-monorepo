package promotions

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	db "pulse-api/db/generated"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func promotionSecurityTestPool(t *testing.T) *pgxpool.Pool {
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
		t.Fatal("refusing non-isolated promotion test database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

type promotionInvoiceFixture struct {
	ownerID, eventID, campaignID pgtype.UUID
	sessionID, paymentIntentID   string
}

func seedPromotionInvoiceFixture(t *testing.T, pool *pgxpool.Pool, liveMode bool) promotionInvoiceFixture {
	t.Helper()
	ctx := context.Background()
	suffix := time.Now().UnixNano()
	fixture := promotionInvoiceFixture{
		sessionID:       fmt.Sprintf("cs_promotion_invoice_%d", suffix),
		paymentIntentID: fmt.Sprintf("pi_promotion_invoice_%d", suffix),
	}
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active)
VALUES($1,$2,'not-used','organizer',TRUE) RETURNING id`, fmt.Sprintf("promotion-owner-%d", suffix), fmt.Sprintf("promotion-%d@example.invalid", suffix)).Scan(&fixture.ownerID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status)
VALUES($1,'Invoice snapshot event','house','Venue','Bucuresti','social',44,26,clock_timestamp()+interval '1 day',clock_timestamp()+interval '5 days',$2,'published') RETURNING id`, fixture.ownerID, fmt.Sprintf("promotion-place-%d", suffix)).Scan(&fixture.eventID); err != nil {
		t.Fatal(err)
	}
	provider := ""
	accountEmail := ""
	companyVAT := ""
	series := ""
	if liveMode {
		provider = "oblio"
		accountEmail = "fiscal@spottr.invalid"
		companyVAT = "RO123456"
		series = "SPT"
	}
	if err := pool.QueryRow(ctx, `INSERT INTO promotion_campaigns(
event_id,organizer_id,plan,placement,status,starts_at,ends_at,amount_bani,
stripe_checkout_session_id,stripe_livemode,billing_email,billing_type,billing_name,
billing_tax_id,billing_registration_number,billing_address,billing_city,billing_county,
billing_sector,billing_country,invoice_provider,invoice_issuer_account_email,
invoice_issuer_company_vat_code,invoice_issuer_series_name,invoice_vat_name,
invoice_vat_percentage,invoice_send_email,invoice_send_to_spv,invoice_payment_type)
VALUES($1,$2,'one_day','feed','pending_payment',clock_timestamp()+interval '1 day',clock_timestamp()+interval '2 days',5000,
$3,$4,$5,'company','Snapshot Buyer SRL','RO999','J00/1/2026','Snapshot Street 1','Cluj','Cluj','','Romania',
$6,$7,$8,$9,'Normala',21,TRUE,TRUE,'Card') RETURNING id`, fixture.eventID, fixture.ownerID, fixture.sessionID, liveMode,
		fmt.Sprintf("promotion-%d@example.invalid", suffix), provider, accountEmail, companyVAT, series).Scan(&fixture.campaignID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), "DELETE FROM promotion_checkout_reviews WHERE campaign_id=$1", fixture.campaignID)
		_, _ = pool.Exec(context.Background(), "DELETE FROM promotion_refund_states WHERE campaign_id=$1 OR payment_intent_id=$2", fixture.campaignID, fixture.paymentIntentID)
		_, _ = pool.Exec(context.Background(), "DELETE FROM promotion_invoices WHERE campaign_id=$1", fixture.campaignID)
		_, _ = pool.Exec(context.Background(), "DELETE FROM promotion_campaigns WHERE id=$1", fixture.campaignID)
		_, _ = pool.Exec(context.Background(), "DELETE FROM events WHERE id=$1", fixture.eventID)
		_, _ = pool.Exec(context.Background(), "DELETE FROM users WHERE id=$1", fixture.ownerID)
	})
	return fixture
}

func TestLivePromotionCannotFulfillWithoutPaymentIntent(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	handler := &Handler{queries: db.New(pool), pool: pool}

	if err := handler.FulfillCampaign(context.Background(), fixture.campaignID.String(), fixture.sessionID, "", true); err == nil {
		t.Fatal("live promotion unexpectedly fulfilled without a payment intent")
	}
	var status string
	var invoiceCount int
	if err := pool.QueryRow(context.Background(), "SELECT status::text FROM promotion_campaigns WHERE id=$1", fixture.campaignID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), "SELECT COUNT(*) FROM promotion_invoices WHERE campaign_id=$1", fixture.campaignID).Scan(&invoiceCount); err != nil {
		t.Fatal(err)
	}
	if status != "pending_payment" || invoiceCount != 0 {
		t.Fatalf("unsafe empty-payment fulfillment: status=%q invoices=%d", status, invoiceCount)
	}
}

func TestLegacyPaidPromotionActivatesOnlyWithManualFiscalReview(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE promotion_campaigns SET stripe_livemode=NULL,
invoice_provider='', invoice_issuer_account_email='', invoice_issuer_company_vat_code='',
invoice_issuer_series_name='' WHERE id=$1`, fixture.campaignID); err != nil {
		t.Fatal(err)
	}
	handler := &Handler{queries: db.New(pool), pool: pool}
	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatal(err)
	}
	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatalf("duplicate legacy fulfillment was not acknowledged: %v", err)
	}
	var status, reason string
	var invoiceCount int
	if err := pool.QueryRow(ctx, "SELECT status::text FROM promotion_campaigns WHERE id=$1", fixture.campaignID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT reason FROM promotion_checkout_reviews WHERE campaign_id=$1", fixture.campaignID).Scan(&reason); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM promotion_invoices WHERE campaign_id=$1", fixture.campaignID).Scan(&invoiceCount); err != nil {
		t.Fatal(err)
	}
	if (status != "scheduled" && status != "active") || reason != "legacy_paid_missing_fiscal_snapshot" || invoiceCount != 0 {
		t.Fatalf("legacy result status=%q reason=%q invoices=%d", status, reason, invoiceCount)
	}
}

func TestLegacyPromotionRefundBeforeSuccessCannotActivate(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE promotion_campaigns SET stripe_livemode=NULL,
invoice_provider='', invoice_issuer_account_email='', invoice_issuer_company_vat_code='',
invoice_issuer_series_name='' WHERE id=$1`, fixture.campaignID); err != nil {
		t.Fatal(err)
	}
	handler := &Handler{queries: db.New(pool), pool: pool}
	handled, err := handler.recordRefund(ctx, fixture.paymentIntentID, fixture.campaignID.String(), "re_legacy", "ch_legacy", 5000, 5000, "full", true)
	if err != nil || !handled {
		t.Fatalf("legacy refund was not recorded: handled=%v err=%v", handled, err)
	}
	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatal(err)
	}
	assertPromotionRefundOutcome(t, pool, fixture, "cancelled", "", 0)
}

func TestPromotionRefundStateCannotRegressAfterSuccessfulRefund(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	handler := &Handler{queries: db.New(pool), pool: pool}
	ctx := context.Background()
	if handled, err := handler.recordRefund(ctx, fixture.paymentIntentID, fixture.campaignID.String(), "re_success", "ch_refund", 5000, 5000, "full", true); err != nil || !handled {
		t.Fatalf("successful refund was not recorded: handled=%v err=%v", handled, err)
	}
	if handled, err := handler.recordRefund(ctx, fixture.paymentIntentID, fixture.campaignID.String(), "re_delayed_failed", "ch_refund", 0, 5000, "failed", true); err != nil || !handled {
		t.Fatalf("delayed refund event was not handled: handled=%v err=%v", handled, err)
	}
	var status string
	var amount int32
	if err := pool.QueryRow(ctx, "SELECT status, refunded_amount_bani FROM promotion_refund_states WHERE payment_intent_id=$1", fixture.paymentIntentID).Scan(&status, &amount); err != nil {
		t.Fatal(err)
	}
	if status != "full" || amount != 5000 {
		t.Fatalf("refund regressed: status=%q amount=%d", status, amount)
	}
}

func TestPromotionRefundBeforeFulfillmentPreventsActivationAndInvoice(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	handler := &Handler{queries: db.New(pool), pool: pool}
	ctx := context.Background()

	handled, err := handler.recordRefund(ctx, fixture.paymentIntentID, fixture.campaignID.String(), "re_before", "ch_before", 5000, 5000, "full", true)
	if err != nil || !handled {
		t.Fatalf("refund was not recorded: handled=%v err=%v", handled, err)
	}
	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatal(err)
	}
	assertPromotionRefundOutcome(t, pool, fixture, "cancelled", "", 0)
}

func TestPromotionRefundAfterQueueCancelsServiceAndQuarantinesInvoice(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	handler := &Handler{queries: db.New(pool), pool: pool}
	ctx := context.Background()
	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatal(err)
	}
	handled, err := handler.recordRefund(ctx, fixture.paymentIntentID, fixture.campaignID.String(), "re_after", "ch_after", 5000, 5000, "full", true)
	if err != nil || !handled {
		t.Fatalf("refund was not recorded: handled=%v err=%v", handled, err)
	}
	assertPromotionRefundOutcome(t, pool, fixture, "cancelled", "needs_review", 5000)
	rows, err := db.New(pool).ListAdminPromotionInvoiceAttention(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, row := range rows {
		if row.CampaignID == fixture.campaignID {
			found = row.InvoiceStatus == "needs_review" && row.RefundStatus == "full" && row.RefundedAmountBani == 5000
		}
	}
	if !found {
		t.Fatal("refunded promotion invoice was not visible in admin attention")
	}
}

func TestPromotionRefundDuringDispatchRequiresManualFiscalReconciliation(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	handler := &Handler{queries: db.New(pool), pool: pool}
	ctx := context.Background()
	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatal(err)
	}
	queries := db.New(pool)
	jobs, err := queries.ClaimPromotionInvoices(ctx, 1)
	if err != nil || len(jobs) != 1 {
		t.Fatalf("claim failed: jobs=%d err=%v", len(jobs), err)
	}
	started, err := queries.BeginPromotionInvoiceDispatch(ctx, db.BeginPromotionInvoiceDispatchParams{ID: jobs[0].ID, ClaimToken: jobs[0].ClaimToken})
	if err != nil || started != 1 {
		t.Fatalf("dispatch did not start: rows=%d err=%v", started, err)
	}
	handled, err := handler.recordRefund(ctx, fixture.paymentIntentID, fixture.campaignID.String(), "re_during", "ch_during", 5000, 5000, "full", true)
	if err != nil || !handled {
		t.Fatalf("refund was not recorded: handled=%v err=%v", handled, err)
	}
	assertPromotionRefundOutcome(t, pool, fixture, "cancelled", "dispatching", 5000)
	var refundStatus string
	if err := pool.QueryRow(ctx, "SELECT refund_status FROM promotion_invoices WHERE campaign_id=$1", fixture.campaignID).Scan(&refundStatus); err != nil || refundStatus != "needs_review" {
		t.Fatalf("refund status=%q err=%v", refundStatus, err)
	}
}

func TestAmbiguousCheckoutIsNotCancelledByReservationCleanup(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "UPDATE promotion_campaigns SET stripe_checkout_session_id=NULL, created_at=clock_timestamp()-interval '1 day' WHERE id=$1", fixture.campaignID); err != nil {
		t.Fatal(err)
	}
	queries := db.New(pool)
	if err := queries.FlagPromotionCheckoutReview(ctx, db.FlagPromotionCheckoutReviewParams{
		CampaignID: fixture.campaignID, Reason: "stripe_session_creation_outcome_unknown",
		StripeLivemode: pgtype.Bool{Bool: true, Valid: true},
	}); err != nil {
		t.Fatal(err)
	}
	if err := queries.CancelAbandonedPromotionReservations(ctx, pgtype.Timestamptz{Time: time.Now(), Valid: true}); err != nil {
		t.Fatal(err)
	}
	var status string
	if err := pool.QueryRow(ctx, "SELECT status::text FROM promotion_campaigns WHERE id=$1", fixture.campaignID).Scan(&status); err != nil || status != "pending_payment" {
		t.Fatalf("ambiguous checkout was cancelled: status=%q err=%v", status, err)
	}
}

func TestStaleSessionlessPromotionIsQuarantinedWithoutMarker(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, "UPDATE promotion_campaigns SET stripe_checkout_session_id=NULL, created_at=clock_timestamp()-interval '1 day' WHERE id=$1", fixture.campaignID); err != nil {
		t.Fatal(err)
	}
	queries := db.New(pool)
	if err := queries.CancelAbandonedPromotionReservations(ctx, pgtype.Timestamptz{Time: time.Now(), Valid: true}); err != nil {
		t.Fatal(err)
	}
	var status, reason string
	if err := pool.QueryRow(ctx, `SELECT campaign.status::text, review.reason
FROM promotion_campaigns campaign JOIN promotion_checkout_reviews review ON review.campaign_id=campaign.id
WHERE campaign.id=$1`, fixture.campaignID).Scan(&status, &reason); err != nil {
		t.Fatal(err)
	}
	if status != "pending_payment" || reason != "stale_sessionless_checkout" {
		t.Fatalf("sessionless checkout status=%q reason=%q", status, reason)
	}
}

func TestRefundSerializedAheadOfFulfillmentCannotMissQueuedInvoice(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	ctx := context.Background()
	lockTx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	lockQueries := db.New(pool).WithTx(lockTx)
	if err := lockQueries.LockPromotionPaymentIntent(ctx, fixture.paymentIntentID); err != nil {
		_ = lockTx.Rollback(ctx)
		t.Fatal(err)
	}

	handler := &Handler{queries: db.New(pool), pool: pool}
	fulfillDone := make(chan error, 1)
	go func() {
		fulfillDone <- handler.FulfillCampaign(context.Background(), fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true)
	}()
	waitForPromotionAdvisoryLock(t, pool)

	handled, err := lockQueries.RecordPromotionRefundState(ctx, db.RecordPromotionRefundStateParams{
		StripeLivemode: true, PaymentIntentID: fixture.paymentIntentID, CampaignID: fixture.campaignID,
		StripeRefundID: "re_serialized", StripeChargeID: "ch_serialized",
		RefundedAmountBani: 5000, ChargeAmountBani: 5000, RefundStatus: "full",
	})
	if err != nil || !handled {
		_ = lockTx.Rollback(ctx)
		t.Fatalf("refund was not recorded under lock: handled=%v err=%v", handled, err)
	}
	if err := lockTx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-fulfillDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("fulfillment did not resume after refund lock committed")
	}
	assertPromotionRefundOutcome(t, pool, fixture, "cancelled", "", 0)
}

func waitForPromotionAdvisoryLock(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		var waiting bool
		err := pool.QueryRow(context.Background(), `SELECT EXISTS (
SELECT 1 FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
  AND wait_event_type='Lock'
  AND wait_event='advisory'
  AND query LIKE '%promotion-payment:%'
)`).Scan(&waiting)
		if err != nil {
			t.Fatal(err)
		}
		if waiting {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("fulfillment never waited on the shared payment advisory lock")
}

func assertPromotionRefundOutcome(t *testing.T, pool *pgxpool.Pool, fixture promotionInvoiceFixture, campaignStatus, invoiceStatus string, refunded int32) {
	t.Helper()
	ctx := context.Background()
	var gotCampaignStatus string
	if err := pool.QueryRow(ctx, "SELECT status::text FROM promotion_campaigns WHERE id=$1", fixture.campaignID).Scan(&gotCampaignStatus); err != nil {
		t.Fatal(err)
	}
	if gotCampaignStatus != campaignStatus {
		t.Fatalf("campaign status=%q, want %q", gotCampaignStatus, campaignStatus)
	}
	var invoiceCount int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM promotion_invoices WHERE campaign_id=$1", fixture.campaignID).Scan(&invoiceCount); err != nil {
		t.Fatal(err)
	}
	if invoiceStatus == "" {
		if invoiceCount != 0 {
			t.Fatalf("unexpected invoice count=%d", invoiceCount)
		}
		return
	}
	var gotInvoiceStatus string
	var gotRefunded int32
	if err := pool.QueryRow(ctx, "SELECT status, refunded_amount_bani FROM promotion_invoices WHERE campaign_id=$1", fixture.campaignID).Scan(&gotInvoiceStatus, &gotRefunded); err != nil {
		t.Fatal(err)
	}
	if gotInvoiceStatus != invoiceStatus || gotRefunded != refunded {
		t.Fatalf("invoice status=%q refunded=%d, want %q/%d", gotInvoiceStatus, gotRefunded, invoiceStatus, refunded)
	}
}

func TestLivePromotionFulfillmentQueuesImmutableInvoiceOnce(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	handler := &Handler{queries: db.New(pool), pool: pool}
	ctx := context.Background()

	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatal(err)
	}
	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatal(err)
	}
	var count int
	var billingName, billingAddress, paymentIntent string
	if err := pool.QueryRow(ctx, `SELECT COUNT(*), MIN(billing_name), MIN(billing_address), MIN(payment_intent_id)
FROM promotion_invoices WHERE campaign_id=$1`, fixture.campaignID).Scan(&count, &billingName, &billingAddress, &paymentIntent); err != nil {
		t.Fatal(err)
	}
	if count != 1 || billingName != "Snapshot Buyer SRL" || billingAddress != "Snapshot Street 1" || paymentIntent != fixture.paymentIntentID {
		t.Fatalf("unexpected immutable invoice snapshot: count=%d name=%q address=%q payment=%q", count, billingName, billingAddress, paymentIntent)
	}

	// The fiscal record is intentionally independent of cascading event data.
	if _, err := pool.Exec(ctx, "DELETE FROM events WHERE id=$1", fixture.eventID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM promotion_invoices WHERE campaign_id=$1", fixture.campaignID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("invoice was lost after event deletion: count=%d err=%v", count, err)
	}
}

func TestRefundAfterEventDeletionUsesRetainedFiscalPaymentEvidence(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	handler := &Handler{queries: db.New(pool), pool: pool}
	ctx := context.Background()
	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "DELETE FROM events WHERE id=$1", fixture.eventID); err != nil {
		t.Fatal(err)
	}
	var campaigns int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM promotion_campaigns WHERE id=$1", fixture.campaignID).Scan(&campaigns); err != nil || campaigns != 0 {
		t.Fatalf("campaign was not removed with event: count=%d err=%v", campaigns, err)
	}
	handled, err := handler.recordRefund(ctx, fixture.paymentIntentID, "", "re_after_event_delete", "ch_after_event_delete", 5000, 5000, "full", true)
	if err != nil || !handled {
		t.Fatalf("retained invoice did not resolve refund: handled=%v err=%v", handled, err)
	}
	var invoiceStatus, refundStatus string
	var refunded int32
	if err := pool.QueryRow(ctx, `SELECT status, refund_status, refunded_amount_bani
FROM promotion_invoices WHERE campaign_id=$1`, fixture.campaignID).Scan(&invoiceStatus, &refundStatus, &refunded); err != nil {
		t.Fatal(err)
	}
	if invoiceStatus != "needs_review" || refundStatus != "full" || refunded != 5000 {
		t.Fatalf("retained invoice status=%q refund=%q amount=%d", invoiceStatus, refundStatus, refunded)
	}
	rows, err := db.New(pool).ListAdminPromotionInvoiceAttention(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, row := range rows {
		if row.CampaignID == fixture.campaignID {
			found = true
		}
	}
	if !found {
		t.Fatal("refund for retained invoice is missing from admin attention")
	}
}

func TestTestModePromotionNeverQueuesFiscalInvoice(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, false)
	handler := &Handler{queries: db.New(pool), pool: pool}
	if err := handler.FulfillCampaign(context.Background(), fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, false); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := pool.QueryRow(context.Background(), "SELECT COUNT(*) FROM promotion_invoices WHERE campaign_id=$1", fixture.campaignID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("test payment queued a fiscal invoice: count=%d err=%v", count, err)
	}
}

func TestAmbiguousPromotionInvoiceDispatchIsNeverAutomaticallyReclaimed(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	fixture := seedPromotionInvoiceFixture(t, pool, true)
	handler := &Handler{queries: db.New(pool), pool: pool}
	ctx := context.Background()
	if err := handler.FulfillCampaign(ctx, fixture.campaignID.String(), fixture.sessionID, fixture.paymentIntentID, true); err != nil {
		t.Fatal(err)
	}
	queries := db.New(pool)
	jobs, err := queries.ClaimPromotionInvoices(ctx, 1)
	if err != nil || len(jobs) != 1 {
		t.Fatalf("claim failed: jobs=%d err=%v", len(jobs), err)
	}
	started, err := queries.BeginPromotionInvoiceDispatch(ctx, db.BeginPromotionInvoiceDispatchParams{ID: jobs[0].ID, ClaimToken: jobs[0].ClaimToken})
	if err != nil || started != 1 {
		t.Fatalf("dispatch did not start: rows=%d err=%v", started, err)
	}
	if _, err := pool.Exec(ctx, "UPDATE promotion_invoices SET updated_at=clock_timestamp()-interval '11 minutes' WHERE id=$1", jobs[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := queries.MarkStalePromotionInvoiceDispatchesForReview(ctx); err != nil {
		t.Fatal(err)
	}
	jobs, err = queries.ClaimPromotionInvoices(ctx, 1)
	if err != nil || len(jobs) != 0 {
		t.Fatalf("ambiguous dispatch was reclaimed: jobs=%d err=%v", len(jobs), err)
	}
	var status string
	if err := pool.QueryRow(ctx, "SELECT status FROM promotion_invoices WHERE id=$1", jobsID(fixture, pool)).Scan(&status); err != nil || status != "needs_review" {
		t.Fatalf("ambiguous dispatch status=%q err=%v", status, err)
	}
}

func jobsID(fixture promotionInvoiceFixture, pool *pgxpool.Pool) pgtype.UUID {
	var id pgtype.UUID
	_ = pool.QueryRow(context.Background(), "SELECT id FROM promotion_invoices WHERE campaign_id=$1", fixture.campaignID).Scan(&id)
	return id
}
