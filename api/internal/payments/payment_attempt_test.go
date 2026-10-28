package payments

import (
	"context"
	"errors"
	"testing"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5"
	"github.com/stripe/stripe-go/v85"
)

func TestPaymentAttemptRequiresSubmissionEvidence(t *testing.T) {
	for _, tc := range []struct {
		name   string
		intent *stripe.PaymentIntent
		want   bool
	}{
		{"missing", nil, false},
		{"opened", &stripe.PaymentIntent{Status: stripe.PaymentIntentStatusRequiresPaymentMethod}, false},
		{"details collected", &stripe.PaymentIntent{Status: stripe.PaymentIntentStatusRequiresConfirmation}, false},
		{"abandoned", &stripe.PaymentIntent{Status: stripe.PaymentIntentStatusCanceled}, false},
		{"declined", &stripe.PaymentIntent{Status: stripe.PaymentIntentStatusRequiresPaymentMethod, LastPaymentError: &stripe.Error{Code: stripe.ErrorCodeCardDeclined}}, true},
		{"authentication", &stripe.PaymentIntent{Status: stripe.PaymentIntentStatusRequiresAction}, true},
		{"processing", &stripe.PaymentIntent{Status: stripe.PaymentIntentStatusProcessing}, true},
		{"authorized", &stripe.PaymentIntent{Status: stripe.PaymentIntentStatusRequiresCapture}, true},
		{"paid", &stripe.PaymentIntent{Status: stripe.PaymentIntentStatusSucceeded}, true},
		{"attempt then canceled", &stripe.PaymentIntent{Status: stripe.PaymentIntentStatusCanceled, LatestCharge: &stripe.Charge{ID: "ch_attempt"}}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := paymentWasAttempted(tc.intent); got != tc.want {
				t.Fatalf("attempted=%v want=%v", got, tc.want)
			}
		})
	}
}

func TestNativeTransactionsAppearAfterSubmissionAndInvoiceAfterSuccess(t *testing.T) {
	pool, h, f, _, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE orders SET user_id=$2,invoice_requested=TRUE WHERE id=$1`, f.orderID, f.ownerID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO organizer_invoicing_settings(organizer_id,provider,account_email,credentials_encrypted,company_vat_code,series_name) VALUES($1,'oblio','test@example.invalid',$2,'1234','TEST')`, f.ownerID, []byte("fixture")); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM billing_invoices WHERE order_id=$1`, f.orderID)
	})
	order, err := h.queries.GetOrderForUpdate(ctx, f.orderID)
	if err != nil {
		t.Fatal(err)
	}
	var firstAttempt time.Time
	for _, state := range []stripe.PaymentIntentStatus{stripe.PaymentIntentStatusRequiresPaymentMethod, stripe.PaymentIntentStatusRequiresAction, stripe.PaymentIntentStatusProcessing, stripe.PaymentIntentStatusSucceeded} {
		intent.Status, intent.AmountReceived = state, 0
		if state == stripe.PaymentIntentStatusSucceeded {
			intent.AmountReceived = 10000
		}
		status, err := h.reconcileNativePaymentIntent(ctx, order, &intent, time.Now().Add(time.Hour), false)
		if err != nil {
			t.Fatal(err)
		}
		rows, err := h.queries.ListUserOrders(ctx, f.ownerID)
		if err != nil {
			t.Fatal(err)
		}
		if state == stripe.PaymentIntentStatusRequiresPaymentMethod {
			if len(rows) != 0 {
				t.Fatal("opening Stripe leaked a transaction")
			}
		} else {
			if len(rows) != 1 || !rows[0].PaymentAttemptedAt.Valid {
				t.Fatalf("submitted payment missing: %+v", rows)
			}
			if firstAttempt.IsZero() {
				firstAttempt = rows[0].PaymentAttemptedAt.Time
			} else if !firstAttempt.Equal(rows[0].PaymentAttemptedAt.Time) {
				t.Fatal("reconciliation changed the first attempt timestamp")
			}
		}
		invoice, invoiceErr := h.queries.CreateBillingInvoiceForOrder(ctx, f.orderID)
		if state != stripe.PaymentIntentStatusSucceeded {
			if status != "pending" || !errors.Is(invoiceErr, pgx.ErrNoRows) {
				t.Fatalf("unpaid payment created invoice: %s %v", status, invoiceErr)
			}
			assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
		} else {
			if status != "completed" || invoiceErr != nil || invoice.OrderID != f.orderID {
				t.Fatalf("paid invoice: %s %v", status, invoiceErr)
			}
			assertCheckoutRetryState(t, pool, f, "completed", 2, 2, false)
			// Invoice creation/availability never creates another transaction.
			if _, err := pool.Exec(ctx, `UPDATE billing_invoices SET status='issued',external_series='TEST',external_number='1',document_url='https://example.invalid/invoice.pdf' WHERE order_id=$1`, f.orderID); err != nil {
				t.Fatal(err)
			}
			rows, err = h.queries.ListUserOrders(ctx, f.ownerID)
			if err != nil || len(rows) != 1 || !rows[0].InvoiceDocumentUrl.Valid {
				t.Fatalf("invoice not attached to the transaction: %v", err)
			}
		}
	}
}

func TestHostedTransactionsObserveExactSessionAndKeepAbandonmentHidden(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedCheckoutRetryFixture(t, pool, "pending", 2, 10)
	h := &CheckoutHandler{db: pool, queries: db.New(pool), expectedLiveMode: true, expectedLiveModeKnown: true}
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE orders SET user_id=$2 WHERE id=$1`, f.orderID, f.ownerID); err != nil {
		t.Fatal(err)
	}
	intent := &stripe.PaymentIntent{ID: f.paymentID, Status: stripe.PaymentIntentStatusRequiresPaymentMethod, Amount: 10000, Currency: stripe.CurrencyRON, Livemode: true, Metadata: map[string]string{"spottr_order_id": common.UUIDToString(f.orderID)}}
	session := &stripe.CheckoutSession{ID: f.sessionID, Status: stripe.CheckoutSessionStatusOpen, Livemode: true, PaymentIntent: intent, Metadata: intent.Metadata}
	h.retrieveSession = func(context.Context, string, string) (*stripe.CheckoutSession, error) { return session, nil }
	for _, attempted := range []bool{false, true} {
		if attempted {
			intent.LastPaymentError = &stripe.Error{Code: stripe.ErrorCodeCardDeclined}
		}
		status, _, err := h.reconcileCheckoutSession(ctx, f.sessionID, "")
		if err != nil || status != "pending" {
			t.Fatalf("session: %s %v", status, err)
		}
		rows, err := h.queries.ListUserOrders(ctx, f.ownerID)
		if err != nil || (len(rows) == 1) != attempted {
			t.Fatalf("visibility before/after Pay: attempted=%v rows=%d err=%v", attempted, len(rows), err)
		}
		assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
	}
}

func TestHostedAttemptRejectsForeignBindings(t *testing.T) {
	for _, wrong := range []string{"account", "mode", "intent", "amount", "fee", "currency", "metadata"} {
		t.Run(wrong, func(t *testing.T) {
			pool := paymentSecurityTestPool(t)
			f := seedCheckoutRetryFixture(t, pool, "pending", 2, 10)
			h := &CheckoutHandler{db: pool, queries: db.New(pool), expectedLiveMode: true, expectedLiveModeKnown: true}
			ctx := context.Background()
			order, err := h.queries.GetOrderForUpdate(ctx, f.orderID)
			if err != nil {
				t.Fatal(err)
			}
			intent := &stripe.PaymentIntent{ID: f.paymentID, Status: stripe.PaymentIntentStatusProcessing, Amount: 10000, Currency: stripe.CurrencyRON, Livemode: true, Metadata: map[string]string{"spottr_order_id": common.UUIDToString(f.orderID)}}
			account := f.accountID
			switch wrong {
			case "account":
				account = "acct_foreign"
			case "mode":
				intent.Livemode = false
			case "intent":
				intent.ID = "pi_foreign"
			case "amount":
				intent.Amount++
			case "fee":
				intent.ApplicationFeeAmount++
			case "currency":
				intent.Currency = stripe.CurrencyEUR
			case "metadata":
				intent.Metadata = nil
			}
			if err := h.recordHostedPaymentAttempt(ctx, order, intent, account); err != nil {
				t.Fatal(err)
			}
			var count int
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM checkout_payment_attempts WHERE order_id=$1`, f.orderID).Scan(&count); err != nil || count != 0 {
				t.Fatalf("foreign submission recorded: %d %v", count, err)
			}
		})
	}
}

func TestHostedSubmissionWebhookBeforeLocalPaymentIntentBinding(t *testing.T) {
	for _, match := range []bool{false, true} {
		t.Run(map[bool]string{false: "foreign intent", true: "exact session"}[match], func(t *testing.T) {
			pool := paymentSecurityTestPool(t)
			f := seedCheckoutRetryFixture(t, pool, "pending", 2, 10)
			ctx := context.Background()
			if _, err := pool.Exec(ctx, `UPDATE orders SET stripe_payment_intent_id=NULL,user_id=$2 WHERE id=$1`, f.orderID, f.ownerID); err != nil {
				t.Fatal(err)
			}
			h := &CheckoutHandler{db: pool, queries: db.New(pool), expectedLiveMode: true, expectedLiveModeKnown: true}
			intent := stripe.PaymentIntent{ID: f.paymentID, Status: stripe.PaymentIntentStatusRequiresAction, Amount: 10000, Currency: stripe.CurrencyRON, Livemode: true, Metadata: map[string]string{"spottr_order_id": common.UUIDToString(f.orderID)}}
			sessionIntentID := "pi_foreign"
			if match {
				sessionIntentID = f.paymentID
			}
			h.retrieveSession = func(_ context.Context, id, account string) (*stripe.CheckoutSession, error) {
				if id != f.sessionID || account != f.accountID {
					t.Fatal("queried an unbound session/account")
				}
				return &stripe.CheckoutSession{ID: id, Livemode: true, Metadata: intent.Metadata, PaymentIntent: &stripe.PaymentIntent{ID: sessionIntentID}}, nil
			}
			if err := h.reconcileNativePaymentEvent(ctx, intent, f.accountID, true); err != nil {
				t.Fatal(err)
			}
			rows, err := h.queries.ListUserOrders(ctx, f.ownerID)
			if err != nil || (len(rows) == 1) != match {
				t.Fatalf("webhook submission visibility: match=%v rows=%d err=%v", match, len(rows), err)
			}
			order, err := h.queries.GetOrderForUpdate(ctx, f.orderID)
			if err != nil || order.StripePaymentIntentID.Valid || order.Status != db.OrderStatusPending {
				t.Fatal("submission observation must not bind or fulfill the order")
			}
		})
	}
}
