package payments

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stripe/stripe-go/v85"
	"net/http"
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
	"strings"
	"testing"
	"time"
)

func TestAutomaticInvoicingNeverAddsCheckoutFee(t *testing.T) {
	for _, tc := range []struct {
		name                string
		used                int
		paid, enabled, live bool
		want                int32
	}{
		{"trial", 19, false, true, true, 0}, {"exhausted without consent", 20, false, true, true, 0}, {"previously paid service", 20, true, true, true, 0}, {"disabled", 20, true, false, true, 0}, {"Stripe test mode", 20, true, true, false, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			pool := paymentSecurityTestPool(t)
			f := seedFreeBookingFixture(t, pool)
			ctx := context.Background()
			_, err := pool.Exec(ctx, `INSERT INTO organizer_invoice_service(organizer_id,free_used,paid_enabled,consented_at,consent_version) VALUES($1,$2,$3,clock_timestamp(),'invoice-service-50-bani-v1')`, f.ownerID, tc.used, tc.paid)
			if err != nil {
				t.Fatal(err)
			}
			_, err = pool.Exec(ctx, `INSERT INTO organizer_invoicing_settings(organizer_id,provider,enabled,account_email,credentials_encrypted,company_vat_code,series_name,vat_name,vat_percentage,send_email,send_to_spv) VALUES($1,'oblio',$2,'test@example.invalid','test'::bytea,'RO123','T','Zero',0,TRUE,FALSE)`, f.ownerID, tc.enabled)
			if err != nil {
				t.Fatal(err)
			}
			h := &CheckoutHandler{db: pool, queries: db.New(pool), expectedLiveMode: tc.live, expectedLiveModeKnown: true}
			expected := int64(16200)
			request := context.WithValue(ctx, expectedCheckoutTotalKey{}, &expected)
			order, _, _, _, _, _, err := h.reserveOrder(request, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 3}, 3, "", BillingDetailsRequest{Type: "individual", Name: "Test", Address: "Test", City: "Test", County: "Test", Country: "RO"})
			if err != nil {
				t.Fatal(err)
			}
			if order.TotalAmount != 150 || order.CustomerTicketingFeeBani != 1200 || order.PlatformFeeBani != 1200+tc.want || order.InvoiceServiceFeeBani != tc.want || order.Status != db.OrderStatusPending {
				t.Fatalf("customer quote or fee changed: customer=%d fee=%d service=%d", order.CustomerTicketingFeeBani, order.PlatformFeeBani, order.InvoiceServiceFeeBani)
			}
			var invoices int
			_ = pool.QueryRow(ctx, `SELECT count(*) FROM billing_invoices WHERE order_id=$1`, order.ID).Scan(&invoices)
			if invoices != 0 {
				t.Fatal("opening checkout issued an invoice")
			}
		})
	}
}

func TestInvoiceServiceFeeRefundSurvivesRetryAndDoesNotRefundCustomer(t *testing.T) {
	for _, alreadyReturned := range []bool{false, true} {
		t.Run(map[bool]string{false: "partial fee refund and crash recovery", true: "whole fee already refunded"}[alreadyReturned], func(t *testing.T) {
			pool, h, f, _, intent := seedNativePaymentFixture(t)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			config := pool.Config()
			config.MaxConns = 1
			limited, poolErr := pgxpool.NewWithConfig(ctx, config)
			if poolErr != nil {
				t.Fatal(poolErr)
			}
			defer limited.Close()
			h.db = limited
			h.queries = db.New(limited)
			_, err := pool.Exec(ctx, `UPDATE orders SET platform_fee_bani=700,invoice_service_fee_bani=50,invoice_service_fee_state='held',status='completed',stripe_livemode=TRUE,stripe_payment_intent_id=$2,completed_at=clock_timestamp()-interval '1 hour',platform_fee_status='earned' WHERE id=$1`, f.orderID, f.paymentID)
			if err != nil {
				t.Fatal(err)
			}
			intent.ApplicationFeeAmount = 700
			intent.LatestCharge = &stripe.Charge{ID: "ch_invoice_service"}
			returned := int64(0)
			if alreadyReturned {
				returned = 700
			}
			posts := 0
			useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch {
				case strings.HasPrefix(r.URL.Path, "/v1/payment_intents/"):
					if r.Header.Get("Stripe-Account") != f.accountID {
						t.Error("wrong connected account")
					}
					_ = json.NewEncoder(w).Encode(intent)
				case r.URL.Path == "/v1/charges/ch_invoice_service":
					_ = json.NewEncoder(w).Encode(stripe.Charge{ID: "ch_invoice_service", ApplicationFee: &stripe.ApplicationFee{ID: "fee_invoice_service"}})
				case r.URL.Path == "/v1/application_fees/fee_invoice_service":
					_ = json.NewEncoder(w).Encode(stripe.ApplicationFee{ID: "fee_invoice_service", Amount: 700, AmountRefunded: returned, Currency: stripe.CurrencyRON, Account: &stripe.Account{ID: f.accountID}, Charge: &stripe.Charge{ID: "ch_invoice_service"}})
				case r.URL.Path == "/v1/application_fees/fee_invoice_service/refunds" && r.Method == http.MethodGet:
					values := []any{}
					if returned == 50 {
						values = append(values, map[string]any{"id": "fr_invoice_service", "amount": 50, "metadata": map[string]string{"spottr_invoice_service_order": common.UUIDToString(f.orderID)}})
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"object": "list", "data": values, "has_more": false})
				case r.URL.Path == "/v1/application_fees/fee_invoice_service/refunds" && r.Method == http.MethodPost:
					_ = r.ParseForm()
					if r.Form.Get("amount") != "50" {
						t.Errorf("wrong fee refund amount: %s", r.Form.Get("amount"))
					}
					if r.Header.Get("Idempotency-Key") == "" {
						t.Error("missing idempotency key")
					}
					posts++
					returned += 50
					_ = json.NewEncoder(w).Encode(stripe.FeeRefund{ID: "fr_invoice_service", Amount: 50})
				default:
					t.Errorf("unexpected Stripe call (must never refund buyer): %s %s", r.Method, r.URL.Path)
					http.Error(w, "unexpected", 500)
				}
			})
			if err = h.reconcileInvoiceServiceFee(ctx, f.orderID); err != nil {
				t.Fatal(err)
			}
			// Simulate successful Stripe refund followed by lost database acknowledgment.
			_, err = pool.Exec(ctx, `UPDATE orders SET invoice_service_fee_state='refund_pending',platform_fee_refunded_bani=0 WHERE id=$1`, f.orderID)
			if err != nil {
				t.Fatal(err)
			}
			if err = h.reconcileInvoiceServiceFee(ctx, f.orderID); err != nil {
				t.Fatal(err)
			}
			if err = h.reconcileInvoiceServiceFee(ctx, f.orderID); err != nil {
				t.Fatal(err)
			}
			var state, status string
			var refunded int32
			err = pool.QueryRow(ctx, `SELECT invoice_service_fee_state,status,platform_fee_refunded_bani FROM orders WHERE id=$1`, f.orderID).Scan(&state, &status, &refunded)
			if err != nil {
				t.Fatal(err)
			}
			wantPosts := 1
			if alreadyReturned {
				wantPosts = 0
			}
			if posts != wantPosts || state != "refunded" || status != "completed" || int64(refunded) != returned {
				t.Fatalf("wrong refund outcome: posts=%d state=%s order=%s refunded=%d", posts, state, status, refunded)
			}
		})
	}
}
