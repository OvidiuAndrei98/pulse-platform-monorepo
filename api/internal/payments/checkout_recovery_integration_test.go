package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"pulse-api/internal/auth"
	"pulse-api/internal/common"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

func recoverCheckoutAs(t *testing.T, h *CheckoutHandler, actor pgtype.UUID, order, event pgtype.UUID, action string) (*httptest.ResponseRecorder, RecoverCheckoutResponse) {
	t.Helper()
	body, _ := json.Marshal(RecoverCheckoutRequest{OrderID: common.UUIDToString(order), EventID: common.UUIDToString(event), Action: action})
	r := httptest.NewRequest(http.MethodPost, "/checkout/recover", bytes.NewReader(body))
	if actor.Valid {
		r = r.WithContext(context.WithValue(r.Context(), auth.UserIDKey, common.UUIDToString(actor)))
	}
	w := httptest.NewRecorder()
	h.HandleRecoverCheckout(w, r)
	var result RecoverCheckoutResponse
	if w.Code == 200 {
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("recovery capability is cacheable")
	}
	return w, result
}

func TestCheckoutRecoveryNativeOwnerResumesSameUnsubmittedReservation(t *testing.T) {
	pool, h, f, _, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE orders SET user_id=$2 WHERE id=$1`, f.orderID, f.ownerID); err != nil {
		t.Fatal(err)
	}
	intent.Status, intent.AmountReceived = stripe.PaymentIntentStatusRequiresPaymentMethod, 0
	var reads, writes atomic.Int32
	useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			writes.Add(1)
		}
		reads.Add(1)
		if r.URL.Path != "/v1/payment_intents/"+f.paymentID || r.Header.Get("Stripe-Account") != f.accountID {
			t.Error("recovery changed the original Stripe binding")
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(intent)
	})
	for range 3 {
		w, got := recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, "check")
		capability, ok := got.Checkout.(map[string]any)
		if w.Code != 200 || got.Status != "pending" || got.PaymentAttempted || !ok || capability["mode"] != "payment_sheet" || capability["paymentIntentId"] != f.paymentID || capability["orderId"] != common.UUIDToString(f.orderID) {
			t.Fatalf("same reservation not recoverable: %d %s", w.Code, w.Body.String())
		}
	}
	var attempts, invoices, orders int
	if err := pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM checkout_payment_attempts WHERE order_id=$1),(SELECT count(*) FROM billing_invoices WHERE order_id=$1),(SELECT count(*) FROM orders WHERE event_id=$2)`, f.orderID, f.eventID).Scan(&attempts, &invoices, &orders); err != nil {
		t.Fatal(err)
	}
	if attempts != 0 || invoices != 0 || orders != 1 || writes.Load() != 0 || reads.Load() != 3 {
		t.Fatalf("recovery started a purchase: attempts=%d invoices=%d orders=%d writes=%d reads=%d", attempts, invoices, orders, writes.Load(), reads.Load())
	}
	assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)

	var stranger pgtype.UUID
	_ = stranger.Scan("49999999-9999-4999-8999-999999999999")
	for _, sample := range []struct {
		actor, event pgtype.UUID
		want         int
	}{{pgtype.UUID{}, f.eventID, 401}, {stranger, f.eventID, 404}, {f.ownerID, stranger, 404}} {
		w, _ := recoverCheckoutAs(t, h, sample.actor, f.orderID, sample.event, "check")
		if w.Code != sample.want || strings.Contains(w.Body.String(), intent.ClientSecret) {
			t.Fatalf("recovery ownership failure: %d %s", w.Code, w.Body.String())
		}
	}
	if reads.Load() != 3 {
		t.Fatal("unauthorized request reached Stripe")
	}
}

func TestCheckoutRecoveryNativeCancellationProcessingAndPaidRace(t *testing.T) {
	for _, scenario := range []string{"cancel", "expired", "processing", "paid_cancel_race", "provider_error"} {
		t.Run(scenario, func(t *testing.T) {
			pool, h, f, _, intent := seedNativePaymentFixture(t)
			ctx := context.Background()
			if _, err := pool.Exec(ctx, `UPDATE orders SET user_id=$2 WHERE id=$1`, f.orderID, f.ownerID); err != nil {
				t.Fatal(err)
			}
			intent.Status, intent.AmountReceived = stripe.PaymentIntentStatusRequiresPaymentMethod, 0
			if scenario == "processing" {
				intent.Status = stripe.PaymentIntentStatusProcessing
			}
			if scenario == "expired" {
				if _, err := pool.Exec(ctx, `UPDATE native_payment_sheet_orders SET expires_at=clock_timestamp()-interval '1 minute' WHERE order_id=$1`, f.orderID); err != nil {
					t.Fatal(err)
				}
			}
			var cancellations atomic.Int32
			useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if scenario == "provider_error" {
					w.WriteHeader(503)
					_, _ = w.Write([]byte(`{"error":{"type":"api_error","message":"fixture unavailable"}}`))
					return
				}
				if r.Method == http.MethodPost {
					if !strings.HasSuffix(r.URL.Path, "/cancel") {
						t.Error("recovery created or confirmed a payment")
					}
					cancellations.Add(1)
					if scenario == "paid_cancel_race" {
						intent.Status, intent.AmountReceived = stripe.PaymentIntentStatusSucceeded, intent.Amount
						w.WriteHeader(400)
						_, _ = w.Write([]byte(`{"error":{"type":"invalid_request_error","message":"already succeeded"}}`))
						return
					}
					intent.Status = stripe.PaymentIntentStatusCanceled
				}
				_ = json.NewEncoder(w).Encode(intent)
			})
			action := "check"
			if scenario == "cancel" || scenario == "paid_cancel_race" {
				action = "cancel"
			}
			w, result := recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, action)
			if scenario == "provider_error" {
				if w.Code != 502 {
					t.Fatalf("provider error fabricated success: %d", w.Code)
				}
				assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
				return
			}
			if w.Code != 200 || result.Checkout != nil {
				t.Fatalf("unexpected recovery result: %d %s", w.Code, w.Body.String())
			}
			switch scenario {
			case "processing":
				if result.Status != "pending" || !result.PaymentAttempted || cancellations.Load() != 0 {
					t.Fatal("processing payment became reusable checkout")
				}
				assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
			case "paid_cancel_race":
				if result.Status != "completed" || !result.PaymentAttempted {
					t.Fatal("successful payment lost cancellation race")
				}
				assertCheckoutRetryState(t, pool, f, "completed", 2, 2, false)
			default:
				if result.Status != "failed" || result.PaymentAttempted || cancellations.Load() != 1 {
					t.Fatal("unpaid reservation was not closed correctly")
				}
				assertCheckoutRetryState(t, pool, f, "failed", 0, 0, false)
			}
			w, again := recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, "cancel")
			if scenario != "processing" && (w.Code != 200 || again.Status != result.Status || cancellations.Load() != 1) {
				t.Fatal("terminal recovery replay changed result or repeated provider cancellation")
			}
		})
	}
}

func TestCheckoutRecoveryStoredGroupContextAndRecipientGuards(t *testing.T) {
	pool, h, f, _, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`UPDATE orders SET user_id=$2 WHERE id=$1`, f.orderID, f.ownerID)
	var group, plan pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO friend_groups(owner_id,created_by,name,request_id,request_fingerprint) VALUES($1,$1,'Recovery QA',gen_random_uuid(),'local') RETURNING id`, f.ownerID).Scan(&group); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO outing_plans(owner_id,group_id,request_id,title,chosen_event_id,decision_round) VALUES($1,$2,gen_random_uuid(),'Recovery QA',$3,1) RETURNING id`, f.ownerID, group, f.eventID).Scan(&plan); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		exec(`DELETE FROM outing_plans WHERE id=$1`, plan)
		exec(`DELETE FROM friend_group_members WHERE group_id=$1`, group)
		exec(`DELETE FROM friend_groups WHERE id=$1`, group)
	})
	exec(`INSERT INTO friend_group_members(group_id,user_id,status) VALUES($1,$2,'accepted')`, group, f.ownerID)
	exec(`INSERT INTO outing_plan_members(plan_id,user_id,status) VALUES($1,$2,'accepted')`, plan, f.ownerID)
	exec(`INSERT INTO outing_ticket_recipients(order_id,ordinal,plan_id,decision_round,event_id,recipient_id,recipient_name) VALUES($1,0,$2,1,$3,$4,'QA')`, f.orderID, plan, f.eventID, f.ownerID)
	intent.Status, intent.AmountReceived = stripe.PaymentIntentStatusRequiresPaymentMethod, 0
	useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			intent.Status = stripe.PaymentIntentStatusCanceled
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(intent)
	})
	w, valid := recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, "check")
	if w.Code != 200 || valid.Checkout == nil || valid.RecoveryReason != "" {
		t.Fatalf("valid stored context rejected: %d %s", w.Code, w.Body.String())
	}
	exec(`UPDATE outing_plans SET decision_round=2 WHERE id=$1`, plan)
	w, changed := recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, "check")
	if w.Code != 200 || changed.Checkout != nil || changed.RecoveryReason != "outing_changed" || changed.PaymentAttempted {
		t.Fatalf("stale decision resumed: %d %s", w.Code, w.Body.String())
	}
	exec(`UPDATE outing_plans SET decision_round=1 WHERE id=$1`, plan)
	exec(`UPDATE friend_group_members SET status='left' WHERE group_id=$1`, group)
	w, denied := recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, "check")
	if w.Code != 200 || denied.Checkout != nil || denied.RecoveryReason != "review_recipients" {
		t.Fatalf("removed group member resumed: %d %s", w.Code, w.Body.String())
	}
	w, closed := recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, "cancel")
	if w.Code != 200 || closed.Status != "failed" {
		t.Fatalf("owner cannot close invalid unpaid selection: %d %s", w.Code, w.Body.String())
	}
	assertCheckoutRetryState(t, pool, f, "failed", 0, 0, false)
}

func TestCheckoutRecoveryHostedKeepsOriginalSessionAndNeverCreatesPayment(t *testing.T) {
	pool, h, f, _, _ := seedNativePaymentFixture(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE orders SET user_id=$2,stripe_checkout_session_id=$3,stripe_payment_intent_id=NULL WHERE id=$1`, f.orderID, f.ownerID, f.sessionID); err != nil {
		t.Fatal(err)
	}
	session := stripe.CheckoutSession{ID: f.sessionID, Status: stripe.CheckoutSessionStatusOpen, Mode: stripe.CheckoutSessionModePayment, Currency: stripe.CurrencyRON, AmountTotal: 10000, Livemode: true, URL: "https://checkout.stripe.com/c/pay/local-fixture", Metadata: map[string]string{"spottr_order_id": common.UUIDToString(f.orderID)}}
	var reads int
	h.retrieveSession = func(_ context.Context, id, account string) (*stripe.CheckoutSession, error) {
		reads++
		if id != f.sessionID || account != f.accountID {
			t.Fatal("hosted recovery switched Stripe binding")
		}
		return &session, nil
	}
	w, got := recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, "check")
	capability, ok := got.Checkout.(map[string]any)
	if w.Code != 200 || got.Status != "pending" || got.PaymentAttempted || !ok || capability["sessionId"] != f.sessionID || capability["checkoutUrl"] != session.URL || reads != 2 {
		t.Fatalf("hosted recovery changed checkout: %d %s", w.Code, w.Body.String())
	}
	session.AmountTotal++
	w, _ = recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, "check")
	if w.Code != 502 {
		t.Fatal("amount mismatch exposed checkout capability")
	}
	session.AmountTotal--
	session.Status = stripe.CheckoutSessionStatusExpired
	w, ended := recoverCheckoutAs(t, h, f.ownerID, f.orderID, f.eventID, "check")
	if w.Code != 200 || ended.Status != "failed" || ended.Checkout != nil || ended.PaymentAttempted {
		t.Fatalf("expired hosted reservation reused: %d %s", w.Code, w.Body.String())
	}
	assertCheckoutRetryState(t, pool, f, "failed", 0, 0, false)
}
