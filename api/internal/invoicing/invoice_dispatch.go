package invoicing

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
)

// Automatic invoicing is free and unlimited. The legacy service tables are
// retained as a durable dispatch journal and historical audit, not a quota.
// Persisting dispatch before the provider call prevents duplicate invoices
// when a worker crashes after the provider has already issued the document.
func (s *Service) beginInvoiceDispatch(ctx context.Context, job db.BillingInvoices) (bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `INSERT INTO organizer_invoice_service(organizer_id) VALUES($1) ON CONFLICT DO NOTHING`, job.OrganizerID); err != nil {
		return false, err
	}
	var status string
	var token pgtype.UUID
	err = tx.QueryRow(ctx, `SELECT status,claim_token FROM billing_invoices WHERE id=$1 FOR UPDATE`, job.ID).Scan(&status, &token)
	if err != nil {
		return false, err
	}
	if status != "processing" || !job.ClaimToken.Valid || token != job.ClaimToken {
		return false, nil
	}
	var orderStatus string
	var live bool
	err = tx.QueryRow(ctx, `SELECT status,COALESCE(stripe_livemode,FALSE) FROM orders WHERE id=$1 FOR UPDATE`, job.OrderID).Scan(&orderStatus, &live)
	if err != nil {
		return false, err
	}
	if orderStatus != "completed" || !live {
		return false, errors.New("Factura necesita o plata live confirmata")
	}
	var enabled bool
	err = tx.QueryRow(ctx, `SELECT enabled FROM organizer_invoicing_settings WHERE organizer_id=$1 AND provider=$2`, job.OrganizerID, job.Provider).Scan(&enabled)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	var usageState string
	err = tx.QueryRow(ctx, `SELECT state FROM invoice_service_usage WHERE invoice_id=$1`, job.ID).Scan(&usageState)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	if usageState != "" && usageState != "reserved" {
		return false, nil
	}
	if !enabled {
		_, err = tx.Exec(ctx, `UPDATE billing_invoices SET status='pending',attempt_count=GREATEST(0,attempt_count-1),next_attempt_at=clock_timestamp()+interval '1 minute',updated_at=clock_timestamp() WHERE id=$1`, job.ID)
		if err != nil {
			return false, err
		}
		return false, tx.Commit(ctx)
	}
	if usageState == "" {
		if _, err = tx.Exec(ctx, `INSERT INTO invoice_service_usage(invoice_id,organizer_id,is_free,fee_bani) VALUES($1,$2,TRUE,0)`, job.ID, job.OrganizerID); err != nil {
			return false, err
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE invoice_service_usage SET state='dispatching',updated_at=clock_timestamp() WHERE invoice_id=$1`, job.ID); err != nil {
		return false, err
	}
	if _, err = tx.Exec(ctx, `UPDATE billing_invoices SET status='dispatching',updated_at=clock_timestamp() WHERE id=$1`, job.ID); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

func (s *Service) finishInvoiceDispatch(ctx context.Context, job db.BillingInvoices, result InvoiceResult) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status string
	var token pgtype.UUID
	err = tx.QueryRow(ctx, `SELECT status,claim_token FROM billing_invoices WHERE id=$1 FOR UPDATE`, job.ID).Scan(&status, &token)
	if err != nil {
		return err
	}
	if status == "issued" {
		return nil
	}
	if !job.ClaimToken.Valid || token != job.ClaimToken || (status != "dispatching" && status != "needs_review") {
		return errors.New("invoice dispatch lost its claim")
	}
	journal, err := tx.Exec(ctx, `UPDATE invoice_service_usage SET state='issued',issued_at=clock_timestamp(),updated_at=clock_timestamp() WHERE invoice_id=$1 AND state IN ('dispatching','needs_review')`, job.ID)
	if err != nil {
		return err
	}
	if journal.RowsAffected() != 1 {
		return errors.New("invoice dispatch journal is missing")
	}
	updated, err := tx.Exec(ctx, `UPDATE billing_invoices SET status='issued',external_series=$3,external_number=$4,external_document_id=$5,document_url=$6,error_message=NULL,issued_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1 AND claim_token=$2 AND status IN ('dispatching','needs_review')`, job.ID, job.ClaimToken, optionalText(result.Series), optionalText(result.Number), optionalText(result.DocumentID), optionalText(result.DocumentURL))
	if err != nil {
		return err
	}
	if updated.RowsAffected() != 1 {
		return errors.New("invoice dispatch lost its claim")
	}
	// Settle only a historical fee already collected before invoicing became free.
	if _, err = tx.Exec(ctx, `UPDATE orders SET invoice_service_fee_state='earned' WHERE id=$1 AND invoice_service_fee_state='held'`, job.OrderID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Service) failInvoiceDispatch(ctx context.Context, job db.BillingInvoices, cause error, needsReview bool, retrySeconds int32) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	status := "failed"
	usageState := "reserved"
	if needsReview {
		status = "needs_review"
		usageState = "needs_review"
	}
	updated, err := tx.Exec(ctx, `UPDATE billing_invoices SET status=$3,error_message=$4,next_attempt_at=clock_timestamp()+make_interval(secs=>$5),updated_at=clock_timestamp() WHERE id=$1 AND claim_token=$2 AND status IN ('processing','dispatching')`, job.ID, job.ClaimToken, status, truncateError(cause), retrySeconds)
	if err != nil {
		return err
	}
	if updated.RowsAffected() == 0 {
		return nil
	}
	if _, err = tx.Exec(ctx, `UPDATE invoice_service_usage SET state=$2,updated_at=clock_timestamp() WHERE invoice_id=$1 AND state IN ('reserved','dispatching')`, job.ID, usageState); err != nil {
		return err
	}
	if !needsReview && job.AttemptCount >= 8 {
		// A known failed issuance can be retried manually. Ambiguous requests
		// retain their journal because the provider may have issued the document.
		if _, err = tx.Exec(ctx, `DELETE FROM invoice_service_usage WHERE invoice_id=$1 AND is_free AND state='reserved'`, job.ID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
