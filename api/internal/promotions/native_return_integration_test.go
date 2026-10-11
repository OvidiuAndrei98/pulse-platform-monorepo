package promotions

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stripe/stripe-go/v85"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/common"
)

func TestNativePromotionReconcileRequiresOwnerAndIsIdempotent(t *testing.T) {
	pool := promotionSecurityTestPool(t)
	f := seedPromotionInvoiceFixture(t, pool, false)
	var calls atomic.Int32
	stripeMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Method != http.MethodGet || r.URL.Path != "/v1/checkout/sessions/"+f.sessionID {
			t.Errorf("unexpected Stripe request %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": f.sessionID, "mode": "payment", "currency": "ron", "amount_total": 5000, "livemode": false, "status": "complete", "payment_status": "paid", "payment_intent": f.paymentIntentID, "metadata": map[string]string{"pulse_promotion_campaign_id": common.UUIDToString(f.campaignID)}})
	}))
	defer stripeMock.Close()
	h := &Handler{queries: db.New(pool), pool: pool, configured: true, client: stripe.NewClient("sk_test_fixture", stripe.WithBackends(stripe.NewBackendsWithConfig(&stripe.BackendConfig{URL: stripe.String(stripeMock.URL), HTTPClient: stripeMock.Client(), MaxNetworkRetries: stripe.Int64(0)})))}
	request := func(userID string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/dashboard/promotions/"+common.UUIDToString(f.campaignID)+"/reconcile", nil)
		route := chi.NewRouteContext()
		route.URLParams.Add("id", common.UUIDToString(f.campaignID))
		ctx := context.WithValue(r.Context(), chi.RouteCtxKey, route)
		if userID != "" {
			ctx = context.WithValue(ctx, auth.UserIDKey, userID)
		}
		w := httptest.NewRecorder()
		h.HandleReconcileCheckout(w, r.WithContext(ctx))
		return w
	}
	if w := request(""); w.Code != http.StatusUnauthorized {
		t.Fatalf("guest: %d", w.Code)
	}
	if w := request("00000000-0000-4000-8000-000000000999"); w.Code != http.StatusNotFound {
		t.Fatalf("foreign campaign: %d %s", w.Code, w.Body.String())
	}
	if calls.Load() != 0 {
		t.Fatal("Stripe called before owner authorization")
	}
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := request(common.UUIDToString(f.ownerID))
			if w.Code != http.StatusOK {
				t.Errorf("reconcile: %d %s", w.Code, w.Body.String())
			}
		}()
	}
	wg.Wait()
	var status string
	if err := pool.QueryRow(context.Background(), "SELECT status::text FROM promotion_campaigns WHERE id=$1", f.campaignID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "scheduled" {
		t.Fatalf("status=%s", status)
	}
	before := calls.Load()
	if w := request(common.UUIDToString(f.ownerID)); w.Code != http.StatusOK {
		t.Fatalf("retry: %d", w.Code)
	}
	if calls.Load() != before {
		t.Fatal("completed campaign unnecessarily contacted Stripe again")
	}
}
