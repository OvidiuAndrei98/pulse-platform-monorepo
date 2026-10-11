package payments

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stripe/stripe-go/v85"
)

func useNativeStripeMock(t *testing.T, h *CheckoutHandler, fn http.HandlerFunc) {
	t.Helper()
	server := httptest.NewServer(fn)
	t.Cleanup(server.Close)
	h.client = stripe.NewClient("sk_test_fixture", stripe.WithBackends(stripe.NewBackendsWithConfig(&stripe.BackendConfig{URL: stripe.String(server.URL), HTTPClient: server.Client(), MaxNetworkRetries: stripe.Int64(0)})))
}

func seedNativePaymentFixture(t *testing.T) (*pgxpool.Pool, *CheckoutHandler, checkoutRetryFixture, db.Orders, stripe.PaymentIntent) {
	t.Helper()
	pool := paymentSecurityTestPool(t)
	f := seedCheckoutRetryFixture(t, pool, "pending", 2, 10)
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `UPDATE orders SET stripe_checkout_session_id=NULL WHERE id=$1`, f.orderID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO native_payment_sheet_orders(order_id,expires_at) VALUES($1,clock_timestamp()+interval '30 minutes')`, f.orderID); err != nil {
		t.Fatal(err)
	}
	h := &CheckoutHandler{queries: db.New(pool), db: pool, configured: true, expectedLiveMode: true, expectedLiveModeKnown: true, publishableKey: "pk_live_fixture"}
	order, err := h.queries.GetOrderForUpdate(ctx, f.orderID)
	if err != nil {
		t.Fatal(err)
	}
	intent := stripe.PaymentIntent{ID: f.paymentID, Amount: 10000, AmountReceived: 10000, Currency: stripe.CurrencyRON,
		CaptureMethod: stripe.PaymentIntentCaptureMethodAutomatic, Status: stripe.PaymentIntentStatusSucceeded, Livemode: true, ClientSecret: "native-test-capability",
		Metadata: map[string]string{"spottr_order_id": common.UUIDToString(f.orderID), "spottr_event_id": common.UUIDToString(f.eventID), "spottr_client": checkoutClientNativeSheet}}
	return pool, h, f, order, intent
}

func TestNativePaymentCreationAndIdempotentReplay(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	ctx := context.Background()
	h := &CheckoutHandler{queries: db.New(pool), db: pool, configured: true, expectedLiveModeKnown: true, publishableKey: "pk_test_fixture"}
	var key pgtype.UUID
	if err := pool.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&key); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM checkout_requests WHERE request_key=$1`, key)
	})
	var creates atomic.Int32
	var intent stripe.PaymentIntent
	useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Stripe-Account"), "acct_test_free_") {
			t.Error("wrong direct-charge account")
		}
		if r.Method == http.MethodPost {
			creates.Add(1)
			_ = r.ParseForm()
			if r.URL.Path != "/v1/payment_intents" || !strings.HasPrefix(r.Header.Get("Idempotency-Key"), "spottr-native-sheet-") {
				t.Error("wrong native create/idempotency context")
			}
			if r.Form.Get("amount") != "5450" || r.Form.Get("application_fee_amount") != "450" || r.Form.Get("currency") != "ron" || r.Form.Get("capture_method") != "automatic" || r.Form.Get("payment_method_types[0]") != "card" {
				t.Error("native charge amount/fee/method not preserved")
			}
			amount, _ := strconv.ParseInt(r.Form.Get("amount"), 10, 64)
			fee, _ := strconv.ParseInt(r.Form.Get("application_fee_amount"), 10, 64)
			intent = stripe.PaymentIntent{ID: "pi_native_creation_" + common.UUIDToString(f.eventID), Amount: amount, ApplicationFeeAmount: fee, Currency: stripe.CurrencyRON, CaptureMethod: stripe.PaymentIntentCaptureMethodAutomatic, Status: stripe.PaymentIntentStatusRequiresPaymentMethod, ClientSecret: "native-create-test-capability", Metadata: map[string]string{"spottr_order_id": r.Form.Get("metadata[spottr_order_id]"), "spottr_event_id": r.Form.Get("metadata[spottr_event_id]"), "spottr_client": r.Form.Get("metadata[spottr_client]")}}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(intent)
	})
	body, _ := json.Marshal(CreateCheckoutRequest{Email: f.buyerEmail, Client: checkoutClientNativeSheet, Items: []CheckoutItemRequest{{TicketTypeID: common.UUIDToString(f.paidTicketID), Quantity: 1}}, BillingDetails: BillingDetailsRequest{Type: "individual", Name: "Buyer", Address: "Address", City: "City", County: "County", Country: "RO"}})
	var original NativePaymentSheetResponse
	for attempt := range 2 {
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(body)))
		r.Header.Set("Idempotency-Key", common.UUIDToString(key))
		route := chi.NewRouteContext()
		route.URLParams.Add("id", common.UUIDToString(f.eventID))
		r = r.WithContext(context.WithValue(ctx, chi.RouteCtxKey, route))
		w := httptest.NewRecorder()
		h.HandleCreateCheckout(w, r)
		if w.Code != http.StatusCreated {
			t.Fatalf("native create/replay status=%d", w.Code)
		}
		if w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("sensitive response is cacheable")
		}
		var result NativePaymentSheetResponse
		if json.Unmarshal(w.Body.Bytes(), &result) != nil {
			t.Fatal("invalid native response")
		}
		if result.Mode != "payment_sheet" || result.OrderID == "" || result.PaymentIntentID != intent.ID || result.PaymentIntentClientSecret == "" || result.PublishableKey != "pk_test_fixture" {
			t.Fatal("incomplete native payment contract")
		}
		if expires, err := time.Parse(time.RFC3339, result.ExpiresAt); err != nil || expires.Before(time.Now().Add(29*time.Minute)) {
			t.Fatal("invalid reservation expiry")
		}
		if attempt == 0 {
			original = result
		} else if result != original {
			t.Fatal("idempotent replay changed native payment")
		}
	}
	var count, sold, markers int
	var storedResponse []byte
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM orders WHERE event_id=$1`, f.eventID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT tickets_sold FROM ticket_types WHERE id=$1`, f.paidTicketID).Scan(&sold); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM native_payment_sheet_orders WHERE order_id=$1`, original.OrderID).Scan(&markers); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `SELECT response FROM checkout_requests WHERE request_key=$1`, key).Scan(&storedResponse); err != nil {
		t.Fatal(err)
	}
	if creates.Load() != 1 || count != 1 || sold != 1 || markers != 1 || len(storedResponse) != 0 {
		t.Fatalf("native replay invariant failed: creates=%d orders=%d sold=%d markers=%d storedResponseBytes=%d", creates.Load(), count, sold, markers, len(storedResponse))
	}
}

func TestNativePaymentConcurrentSuccessAndCancelReconcile(t *testing.T) {
	pool, h, f, order, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	var cancellations atomic.Int32
	useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost {
			cancellations.Add(1)
			w.WriteHeader(400)
			_, _ = w.Write([]byte(`{"error":{"type":"invalid_request_error","message":"PaymentIntent already succeeded"}}`))
			return
		}
		_ = json.NewEncoder(w).Encode(intent)
	})
	stillPending := intent
	stillPending.Status = stripe.PaymentIntentStatusRequiresPaymentMethod
	stillPending.AmountReceived = 0
	var wg sync.WaitGroup
	failures := make(chan error, 12)
	for i := range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if i%2 == 0 {
				_, err := h.reconcileNativePaymentIntent(ctx, order, &stillPending, time.Now().Add(time.Minute), true)
				failures <- err
			} else {
				failures <- h.reconcileNativePaymentEvent(ctx, intent, f.accountID, true)
			}
		}()
	}
	wg.Wait()
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	if cancellations.Load() == 0 {
		t.Fatal("cancel race was not exercised")
	}
	assertCheckoutRetryState(t, pool, f, "completed", 2, 2, false)
}

func TestNativePaymentCancellationIsIdempotentAndDoesNotIssueTickets(t *testing.T) {
	pool, h, f, order, intent := seedNativePaymentFixture(t)
	intent.Status = stripe.PaymentIntentStatusCanceled
	intent.AmountReceived = 0
	var wg sync.WaitGroup
	failures := make(chan error, 8)
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := h.reconcileNativePaymentIntent(context.Background(), order, &intent, time.Now().Add(time.Minute), true)
			failures <- err
		}()
	}
	wg.Wait()
	close(failures)
	for err := range failures {
		if err != nil {
			t.Fatal(err)
		}
	}
	assertCheckoutRetryState(t, pool, f, "failed", 0, 0, false)
}

func TestNativePaymentWorkerRetainsUncertainProcessingAndReleasesOnlyCanceled(t *testing.T) {
	pool, h, f, _, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	intent.Status = stripe.PaymentIntentStatusProcessing
	intent.AmountReceived = 0
	var terminal atomic.Bool
	var cancels atomic.Int32
	useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodPost {
			cancels.Add(1)
			w.WriteHeader(503)
			_, _ = w.Write([]byte(`{"error":{"type":"api_error","message":"temporarily unavailable"}}`))
			return
		}
		value := intent
		if terminal.Load() {
			value.Status = stripe.PaymentIntentStatusCanceled
		}
		_ = json.NewEncoder(w).Encode(value)
	})
	if _, err := pool.Exec(ctx, `UPDATE orders SET created_at=clock_timestamp()-interval '40 minutes',checkout_reconcile_after=clock_timestamp()-interval '1 minute' WHERE id=$1`, f.orderID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE native_payment_sheet_orders SET expires_at=clock_timestamp()-interval '10 minutes' WHERE order_id=$1`, f.orderID); err != nil {
		t.Fatal(err)
	}
	h.reconcilePendingPaymentSheets(ctx)
	assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
	if cancels.Load() != 1 {
		t.Fatal("expired PI was not canceled exactly once")
	}
	terminal.Store(true)
	if _, err := pool.Exec(ctx, `UPDATE orders SET checkout_reconcile_after=clock_timestamp()-interval '1 minute' WHERE id=$1`, f.orderID); err != nil {
		t.Fatal(err)
	}
	h.reconcilePendingPaymentSheets(ctx)
	assertCheckoutRetryState(t, pool, f, "failed", 0, 0, false)
}

func TestNativePaymentCapabilityAndMetadataCannotCancelAnotherOrder(t *testing.T) {
	pool, h, f, _, intent := seedNativePaymentFixture(t)
	intent.Status = stripe.PaymentIntentStatusRequiresPaymentMethod
	intent.AmountReceived = 0
	var cancels atomic.Int32
	useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			cancels.Add(1)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(intent)
	})
	for _, change := range []func(*NativePaymentSheetRequest){func(r *NativePaymentSheetRequest) { r.PaymentIntentClientSecret = "wrong" }, func(r *NativePaymentSheetRequest) { r.PaymentIntentID = "pi_foreign" }, func(r *NativePaymentSheetRequest) { r.EventID = "11111111-1111-4111-8111-111111111111" }} {
		req := NativePaymentSheetRequest{OrderID: common.UUIDToString(f.orderID), EventID: common.UUIDToString(f.eventID), PaymentIntentID: f.paymentID, PaymentIntentClientSecret: intent.ClientSecret}
		change(&req)
		body, _ := json.Marshal(req)
		w := httptest.NewRecorder()
		h.HandleCancelPaymentSheet(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(body))))
		if w.Code != http.StatusNotFound {
			t.Fatalf("forged capability got status %d", w.Code)
		}
	}
	forged := intent
	forged.ID = "pi_forged_copied_metadata"
	forged.Status = stripe.PaymentIntentStatusSucceeded
	forged.AmountReceived = 10000
	if err := h.reconcileNativePaymentEvent(context.Background(), forged, f.accountID, true); err != nil {
		t.Fatal(err)
	}
	intent.Status = stripe.PaymentIntentStatusSucceeded
	intent.AmountReceived = 10000
	if err := h.reconcileNativePaymentEvent(context.Background(), intent, "acct_foreign", true); err != nil {
		t.Fatal(err)
	}
	if cancels.Load() != 0 {
		t.Fatal("invalid payment capability reached provider cancellation")
	}
	assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
}

func TestNativePaymentRequiresServerMarkerAndCorrectAmounts(t *testing.T) {
	pool, h, f, order, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	for _, change := range []func(*stripe.PaymentIntent){func(p *stripe.PaymentIntent) { p.Amount-- }, func(p *stripe.PaymentIntent) { p.ApplicationFeeAmount++ }, func(p *stripe.PaymentIntent) { p.Livemode = false }} {
		invalid := intent
		change(&invalid)
		if _, err := h.reconcileNativePaymentIntent(ctx, order, &invalid, time.Now().Add(time.Minute), false); err == nil {
			t.Fatal("invalid paid payment fulfilled")
		}
	}
	if _, err := pool.Exec(ctx, `DELETE FROM native_payment_sheet_orders WHERE order_id=$1`, f.orderID); err != nil {
		t.Fatal(err)
	}
	if err := h.fulfillPaidOrder(ctx, "", intent.ID, common.UUIDToString(f.orderID), f.accountID, true, &intent); err == nil {
		t.Fatal("payment without server marker fulfilled")
	}
	assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
}

func TestNativePaymentFailedAttemptRetainsReservationAndEventClosureHoldsPaidOrder(t *testing.T) {
	pool, h, f, order, intent := seedNativePaymentFixture(t)
	ctx := context.Background()
	intent.Status = stripe.PaymentIntentStatusRequiresPaymentMethod
	intent.AmountReceived = 0
	status, err := h.reconcileNativePaymentIntent(ctx, order, &intent, time.Now().Add(time.Minute), false)
	if err != nil || status != "pending" {
		t.Fatalf("retryable payment: status=%s err=%v", status, err)
	}
	assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
	if _, err := pool.Exec(ctx, `UPDATE events SET status='completed' WHERE id=$1`, f.eventID); err != nil {
		t.Fatal(err)
	}
	intent.Status = stripe.PaymentIntentStatusSucceeded
	intent.AmountReceived = 10000
	status, err = h.reconcileNativePaymentIntent(ctx, order, &intent, time.Now().Add(time.Minute), false)
	if err != nil || status != "failed" {
		t.Fatalf("closed event payment: status=%s err=%v", status, err)
	}
	assertCheckoutRetryState(t, pool, f, "pending", 2, 0, true)
}

func TestNativePaymentExpiredReplayNeverInvitesRetryWhileStillPayable(t *testing.T) {
	for _, status := range []stripe.PaymentIntentStatus{stripe.PaymentIntentStatusProcessing, stripe.PaymentIntentStatusSucceeded, stripe.PaymentIntentStatusCanceled} {
		t.Run(string(status), func(t *testing.T) {
			pool, h, f, _, intent := seedNativePaymentFixture(t)
			ctx := context.Background()
			intent.Status = status
			if status != stripe.PaymentIntentStatusSucceeded {
				intent.AmountReceived = 0
			}
			useNativeStripeMock(t, h, func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.Method == http.MethodPost {
					w.WriteHeader(503)
					_, _ = w.Write([]byte(`{"error":{"type":"api_error","message":"temporarily unavailable"}}`))
					return
				}
				_ = json.NewEncoder(w).Encode(intent)
			})
			var key pgtype.UUID
			if err := pool.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&key); err != nil {
				t.Fatal(err)
			}
			requestID, _, err := h.claimCheckoutRequest(ctx, key, "native-replay:"+common.UUIDToString(f.orderID), []byte(`{"test":"expired replay"}`))
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM checkout_requests WHERE id=$1`, requestID) })
			if _, err := pool.Exec(ctx, `UPDATE checkout_requests SET order_id=$2 WHERE id=$1`, requestID, f.orderID); err != nil {
				t.Fatal(err)
			}
			if _, err := pool.Exec(ctx, `UPDATE native_payment_sheet_orders SET expires_at=clock_timestamp()-interval '1 minute' WHERE order_id=$1`, f.orderID); err != nil {
				t.Fatal(err)
			}
			w := httptest.NewRecorder()
			h.replayNativePaymentSheet(w, httptest.NewRequest(http.MethodPost, "/", nil), requestID)
			switch status {
			case stripe.PaymentIntentStatusProcessing:
				if w.Code != http.StatusTooEarly {
					t.Fatalf("uncertain replay must preserve request key: got %d", w.Code)
				}
				assertCheckoutRetryState(t, pool, f, "pending", 2, 0, false)
			case stripe.PaymentIntentStatusSucceeded:
				if w.Code != http.StatusCreated {
					t.Fatalf("paid replay lost recoverable identity: got %d", w.Code)
				}
				assertCheckoutRetryState(t, pool, f, "completed", 2, 2, false)
			case stripe.PaymentIntentStatusCanceled:
				if w.Code != http.StatusConflict {
					t.Fatalf("canceled replay got %d", w.Code)
				}
				assertCheckoutRetryState(t, pool, f, "failed", 0, 0, false)
			}
		})
	}
}
