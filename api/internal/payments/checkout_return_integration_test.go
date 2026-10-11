package payments

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	db "pulse-api/db/generated"
	"pulse-api/internal/common"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stripe/stripe-go/v85"
)

func TestCreateCheckoutPreservesReturnClientAndReservationOnRetry(t *testing.T) {
	for _, clientName := range []string{"", checkoutClientNative, checkoutClientNativeWeb} {
		origin := ""
		if clientName == checkoutClientNativeWeb {
			origin = "http://localhost:8082"
		}
		name := clientName
		if name == "" {
			name = "web"
		}
		t.Run(name, func(t *testing.T) {
			pool := paymentSecurityTestPool(t)
			f := seedFreeBookingFixture(t, pool)
			ctx := context.Background()
			var key pgtype.UUID
			if err := pool.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&key); err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				_, _ = pool.Exec(context.Background(), "DELETE FROM checkout_requests WHERE request_key=$1", key)
			})
			eventID := common.UUIDToString(f.eventID)
			sessionID := "cs_test_return_" + eventID
			h := &CheckoutHandler{queries: db.New(pool), db: pool, appURL: "https://app.example.test", configured: true, expectedLiveModeKnown: true}
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if err := r.ParseForm(); err != nil {
					t.Error(err)
				}
				if r.Method != http.MethodPost || r.URL.Path != "/v1/checkout/sessions" || r.Header.Get("Stripe-Account") == "" || !strings.HasPrefix(r.Header.Get("Idempotency-Key"), "pulse-checkout-") {
					t.Errorf("unexpected Stripe checkout context: %s %s", r.Method, r.URL.Path)
				}
				if got, want := r.Form.Get("success_url"), h.checkoutSuccessURL(clientName, eventID, "{CHECKOUT_SESSION_ID}", origin); got != want {
					t.Errorf("success URL: got %q want %q", got, want)
				}
				if got, want := r.Form.Get("cancel_url"), h.checkoutCancelURL(clientName, eventID, origin); got != want {
					t.Errorf("cancel URL: got %q want %q", got, want)
				}
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]any{"id": sessionID, "url": "https://checkout.stripe.com/test", "livemode": false})
			}))
			defer server.Close()
			h.client = stripe.NewClient("sk_test_fixture", stripe.WithBackends(stripe.NewBackendsWithConfig(&stripe.BackendConfig{URL: stripe.String(server.URL), HTTPClient: server.Client(), MaxNetworkRetries: stripe.Int64(0)})))
			body, err := json.Marshal(CreateCheckoutRequest{
				Email: f.buyerEmail, Client: clientName, ReturnOrigin: origin,
				Items:          []CheckoutItemRequest{{TicketTypeID: common.UUIDToString(f.paidTicketID), Quantity: 1}},
				BillingDetails: BillingDetailsRequest{Type: "individual", Name: "Buyer", Address: "Address", City: "City", County: "County", Country: "RO"},
			})
			if err != nil {
				t.Fatal(err)
			}
			var original CreateCheckoutResponse
			for attempt := range 2 {
				r := httptest.NewRequest(http.MethodPost, "/events/"+eventID+"/checkout", strings.NewReader(string(body)))
				r.Header.Set("Idempotency-Key", common.UUIDToString(key))
				route := chi.NewRouteContext()
				route.URLParams.Add("id", eventID)
				r = r.WithContext(context.WithValue(ctx, chi.RouteCtxKey, route))
				w := httptest.NewRecorder()
				h.HandleCreateCheckout(w, r)
				if w.Code != http.StatusCreated {
					t.Fatalf("attempt %d: %d %s", attempt, w.Code, w.Body.String())
				}
				var response CreateCheckoutResponse
				if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				if response.SessionID != sessionID || response.OrderID == "" || response.CheckoutURL != "https://checkout.stripe.com/test" {
					t.Fatalf("checkout identity missing: %+v", response)
				}
				if attempt == 0 {
					original = response
				} else if response != original {
					t.Fatalf("retry changed the checkout: %+v != %+v", response, original)
				}
			}
			var orders, sold int
			if err := pool.QueryRow(ctx, "SELECT count(*) FROM orders WHERE event_id=$1", f.eventID).Scan(&orders); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, "SELECT tickets_sold FROM ticket_types WHERE id=$1", f.paidTicketID).Scan(&sold); err != nil {
				t.Fatal(err)
			}
			if calls.Load() != 1 || orders != 1 || sold != 1 {
				t.Fatalf("retry duplicated checkout: Stripe calls=%d orders=%d reserved=%d", calls.Load(), orders, sold)
			}
		})
	}
}

func TestCheckoutReplayReturnsSessionIDForLegacyAndNativeResponses(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	h := &CheckoutHandler{queries: db.New(pool), db: pool, appURL: "https://app.example.test"}
	ctx := context.Background()
	var key pgtype.UUID
	if err := pool.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&key); err != nil {
		t.Fatal(err)
	}
	requestID, _, err := h.claimCheckoutRequest(ctx, key, f.buyerEmail, []byte("native-return-test"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), "DELETE FROM checkout_requests WHERE id=$1", requestID) })
	requestCtx := context.WithValue(ctx, checkoutRequestContextKey{}, requestID)
	order, _, _, _, account, _, err := h.reserveOrder(requestCtx, f.eventID, f.buyerID, f.buyerEmail, nil, map[string]int32{common.UUIDToString(f.paidTicketID): 1}, 1, "", BillingDetailsRequest{Type: "individual", Name: "Buyer", Address: "Address", City: "City", County: "County", Country: "RO"})
	if err != nil {
		t.Fatal(err)
	}
	sessionID := "cs_test_native_return_" + common.UUIDToString(order.ID)
	if _, err = pool.Exec(ctx, "UPDATE orders SET stripe_checkout_session_id=$1 WHERE id=$2", sessionID, order.ID); err != nil {
		t.Fatal(err)
	}
	legacy, _ := json.Marshal(map[string]string{"checkoutUrl": "https://checkout.stripe.com/test", "orderId": common.UUIDToString(order.ID)})
	if _, err = pool.Exec(ctx, "UPDATE checkout_requests SET response=$1 WHERE id=$2", legacy, requestID); err != nil {
		t.Fatal(err)
	}
	retrievals := 0
	status := stripe.CheckoutSessionStatusComplete
	h.retrieveSession = func(_ context.Context, id, connectedAccount string) (*stripe.CheckoutSession, error) {
		retrievals++
		if id != sessionID || connectedAccount != account {
			t.Fatalf("wrong Stripe context: %q %q", id, connectedAccount)
		}
		return &stripe.CheckoutSession{ID: id, URL: "https://checkout.stripe.com/test", Status: status}, nil
	}
	replay := func(client string) (CreateCheckoutResponse, int) {
		w := httptest.NewRecorder()
		h.replayCheckoutRequest(w, httptest.NewRequest(http.MethodPost, "/checkout", nil), requestID, client)
		var result CreateCheckoutResponse
		if w.Code == http.StatusCreated {
			if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
				t.Fatal(err)
			}
			if result.OrderID != common.UUIDToString(order.ID) || result.SessionID != sessionID {
				t.Fatalf("replay lost checkout identity: %+v", result)
			}
		}
		return result, w.Code
	}
	if _, code := replay(""); code != http.StatusCreated || retrievals != 0 {
		t.Fatalf("legacy cached response did not recover local Session ID: %d, calls=%d", code, retrievals)
	}
	if _, err = pool.Exec(ctx, "UPDATE checkout_requests SET created_at=now()-interval '21 minutes' WHERE id=$1", requestID); err != nil {
		t.Fatal(err)
	}
	for _, client := range []string{"", checkoutClientNative} {
		result, code := replay(client)
		if code != http.StatusCreated || result.CheckoutURL != h.checkoutSuccessURL(client, common.UUIDToString(f.eventID), sessionID) {
			t.Fatalf("completed replay used the wrong return route: %d %+v", code, result)
		}
	}
	status = stripe.CheckoutSessionStatusOpen
	if result, code := replay(checkoutClientNative); code != http.StatusCreated || !strings.HasPrefix(result.CheckoutURL, "https://checkout.stripe.com/") {
		t.Fatalf("open session was not resumed: %d %+v", code, result)
	}
	status = stripe.CheckoutSessionStatusExpired
	if _, code := replay(checkoutClientNative); code != http.StatusConflict {
		t.Fatalf("expired session response: %d", code)
	}
}

func TestCheckoutIdempotencyRejectsSwitchingReturnClient(t *testing.T) {
	pool := paymentSecurityTestPool(t)
	f := seedFreeBookingFixture(t, pool)
	h := &CheckoutHandler{queries: db.New(pool), db: pool}
	var key pgtype.UUID
	if err := pool.QueryRow(context.Background(), "SELECT gen_random_uuid()").Scan(&key); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/checkout", nil)
	req.Header.Set("Idempotency-Key", common.UUIDToString(key))
	payload := CreateCheckoutRequest{Email: f.buyerEmail}
	_, id, proceed := h.beginCheckoutRequest(httptest.NewRecorder(), req, f.eventID, f.buyerID, payload)
	if !proceed {
		t.Fatal("initial web request was not claimed")
	}
	t.Cleanup(func() { h.releaseUnreservedRequest(id) })
	payload.Client = checkoutClientNative
	w := httptest.NewRecorder()
	_, _, proceed = h.beginCheckoutRequest(w, req, f.eventID, f.buyerID, payload)
	if proceed || w.Code != http.StatusConflict {
		t.Fatalf("changed return client reused an intent: %d %s", w.Code, w.Body.String())
	}
}
