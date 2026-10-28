package payments

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stripe/stripe-go/v85"
	db "pulse-api/db/generated"
	"pulse-api/internal/common"
)

func TestInclusiveVATNeverIncreasesCheckoutAmount(t *testing.T) {
	for _, rate := range []string{"0", "11", "21", "5.25"} {
		t.Run(rate, func(t *testing.T) {
			var numeric pgtype.Numeric
			_ = numeric.Scan(rate)
			id := "txr_test"
			if rate == "0" {
				id = ""
			}
			params := &stripe.CheckoutSessionCreateParams{PaymentIntentData: &stripe.CheckoutSessionCreatePaymentIntentDataParams{ApplicationFeeAmount: stripe.Int64(650)}, LineItems: []*stripe.CheckoutSessionCreateLineItemParams{
				{Quantity: stripe.Int64(2), PriceData: &stripe.CheckoutSessionCreateLineItemPriceDataParams{UnitAmount: stripe.Int64(5000)}},
				{Quantity: stripe.Int64(1), PriceData: &stripe.CheckoutSessionCreateLineItemPriceDataParams{UnitAmount: stripe.Int64(650)}},
			}}
			applyInclusiveEventVAT(params, numeric, id)
			var total int64
			for _, item := range params.LineItems {
				total += *item.Quantity * *item.PriceData.UnitAmount
				if *item.PriceData.TaxBehavior != "inclusive" {
					t.Fatal("exclusive VAT would overcharge")
				}
				if id == "" && len(item.TaxRates) != 0 {
					t.Fatal("no VAT must not apply a Stripe tax")
				}
				if id != "" && (len(item.TaxRates) != 1 || *item.TaxRates[0] != id) {
					t.Fatal("missing rate")
				}
			}
			if total != 10650 || *params.PaymentIntentData.ApplicationFeeAmount != 650 {
				t.Fatal("VAT changed charged amount or commission")
			}
			if params.Metadata["spottr_vat_percentage"] != params.PaymentIntentData.Metadata["spottr_vat_percentage"] {
				t.Fatal("metadata differs")
			}
		})
	}
}

func TestEventVATZeroAndMissingNeverCallStripe(t *testing.T) {
	h := &CheckoutHandler{}
	if _, err := h.eventTaxRate(context.Background(), "acct_test", pgtype.Numeric{}); err == nil {
		t.Fatal("missing VAT must fail")
	}
	var zero pgtype.Numeric
	_ = zero.Scan("0")
	if id, err := h.eventTaxRate(context.Background(), "acct_test", zero); err != nil || id != "" {
		t.Fatalf("zero VAT: %s %v", id, err)
	}
}

// Real migrated SQL, fake Stripe HTTP only. Never uses real credentials/accounts.
func TestEventVATStripeCacheIntegration(t *testing.T) {
	dsn := os.Getenv("TICKET_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TICKET_TEST_DATABASE_URL to local spottr_ticket_test")
	}
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Host != "127.0.0.1" || cfg.Database != "spottr_ticket_test" {
		t.Fatal("refusing non-isolated database")
	}
	ctx := context.Background()
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	calls := 0
	account, live, percentage := "acct_vat_a", false, "21"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_ = r.ParseForm()
		sentRate, _ := strconv.ParseFloat(r.Form.Get("percentage"), 64)
		wantRate, _ := strconv.ParseFloat(percentage, 64)
		if r.URL.Path != "/v1/tax_rates" || r.Header.Get("Stripe-Account") != account || r.Header.Get("Idempotency-Key") == "" || r.Form.Get("inclusive") != "true" || sentRate != wantRate {
			t.Errorf("wrong tax request: %s %v", r.URL.Path, r.Form)
		}
		var n pgtype.Numeric
		_ = n.Scan(percentage)
		f, _ := n.Float64Value()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": fmt.Sprintf("txr_%d", calls), "inclusive": true, "livemode": live, "percentage": f.Float64})
	}))
	defer server.Close()
	client := stripe.NewClient("sk_test_fixture", stripe.WithBackends(stripe.NewBackendsWithConfig(&stripe.BackendConfig{URL: stripe.String(server.URL), HTTPClient: server.Client(), MaxNetworkRetries: stripe.Int64(0)})))
	h := &CheckoutHandler{queries: db.New(tx), client: client, expectedLiveModeKnown: true}
	for _, test := range []struct {
		account   string
		live      bool
		rate      string
		wantCalls int
	}{
		{"acct_vat_a", false, "21", 1}, {"acct_vat_a", false, "21", 1}, {"acct_vat_b", false, "21", 2}, {"acct_vat_a", true, "21", 3}, {"acct_vat_a", false, "11", 4},
	} {
		account, live, percentage = test.account, test.live, test.rate
		h.expectedLiveMode = live
		var n pgtype.Numeric
		_ = n.Scan(percentage)
		if id, err := h.eventTaxRate(ctx, account, n); err != nil || id == "" {
			t.Fatalf("create/cache: %s %v", id, err)
		}
		if calls != test.wantCalls {
			t.Fatalf("cache leaked account, mode or rate: calls=%d want=%d", calls, test.wantCalls)
		}
	}
}

func TestCheckoutRequiresVATAndSnapshotsEventRateIntegration(t *testing.T) {
	dsn := os.Getenv("TICKET_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TICKET_TEST_DATABASE_URL to local spottr_ticket_test")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_ticket_test" {
		t.Fatal("refusing non-isolated database")
	}
	ctx := context.Background()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	suffix := fmt.Sprintf("vat-%d", time.Now().UnixNano())
	var owner, event, ticketType pgtype.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'unused','organizer',true) RETURNING id`, suffix, suffix+"@example.invalid").Scan(&owner); err != nil {
		t.Fatal(err)
	}
	// Delete only these test fixtures. No live APIs or provider credentials.
	defer func() {
		_, _ = pool.Exec(ctx, `DELETE FROM orders WHERE event_id=$1`, event)
		_, _ = pool.Exec(ctx, `DELETE FROM ticket_types WHERE event_id=$1`, event)
		_, _ = pool.Exec(ctx, `DELETE FROM events WHERE id=$1`, event)
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	}()
	if err := pool.QueryRow(ctx, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status) VALUES($1,'VAT checkout','house','Venue','Bucuresti','indoor',44,26,now()+interval '1 day',now()+interval '2 days','place','published') RETURNING id`, owner).Scan(&event); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO organizer_profiles(user_id,cui,company_name,fiscal_address,is_verified,verification_status,stripe_account_id,stripe_charge_type,stripe_charges_enabled,stripe_payouts_enabled) VALUES($1,$2,'Fixture','Address',true,'approved','acct_vat_checkout','direct',true,true)`, owner, fmt.Sprintf("%d", time.Now().UnixNano())); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales) VALUES($1,'General',50,100,now()-interval '1 day',now()+interval '1 day') RETURNING id`, event).Scan(&ticketType); err != nil {
		t.Fatal(err)
	}
	h := &CheckoutHandler{db: pool, queries: db.New(pool)}
	expectedTotal := int64(5400)
	reserve := func() (db.Orders, error) {
		o, _, _, _, _, _, err := h.reserveOrder(context.WithValue(ctx, expectedCheckoutTotalKey{}, &expectedTotal), event, pgtype.UUID{}, suffix+"@example.invalid", nil, map[string]int32{common.UUIDToString(ticketType): 1}, 1, "", BillingDetailsRequest{Type: "individual", Country: "Romania"})
		return o, err
	}
	_, err = reserve()
	var requestErr *checkoutRequestError
	if !errors.As(err, &requestErr) || requestErr.status != http.StatusConflict {
		t.Fatalf("unconfigured VAT accepted: %v", err)
	}
	var sold int
	if err := pool.QueryRow(ctx, `SELECT tickets_sold FROM ticket_types WHERE id=$1`, ticketType).Scan(&sold); err != nil || sold != 0 {
		t.Fatalf("rejected VAT reserved inventory: %d %v", sold, err)
	}
	for _, rate := range []float64{19, 9, 5.25, 100} {
		if _, err := pool.Exec(ctx, `UPDATE events SET vat_percentage=$1 WHERE id=$2`, rate, event); err != nil {
			t.Fatal(err)
		}
		_, err := reserve()
		if !errors.As(err, &requestErr) || requestErr.status != http.StatusConflict {
			t.Fatalf("unsupported VAT %v accepted: %v", rate, err)
		}
		if err := pool.QueryRow(ctx, `SELECT tickets_sold FROM ticket_types WHERE id=$1`, ticketType).Scan(&sold); err != nil || sold != 0 {
			t.Fatalf("unsupported VAT reserved inventory: %d %v", sold, err)
		}
	}
	for _, rate := range []int{21, 11, 0} {
		if _, err := pool.Exec(ctx, `UPDATE events SET vat_percentage=$1 WHERE id=$2`, rate, event); err != nil {
			t.Fatal(err)
		}
		order, err := reserve()
		if err != nil {
			t.Fatal(err)
		}
		actual, _ := order.TicketVatPercentage.Float64Value()
		if !actual.Valid || actual.Float64 != float64(rate) || order.TotalAmount != 50 || order.CustomerTicketingFeeBani != 400 {
			t.Fatalf("incorrect inclusive snapshot: %+v", order)
		}
		if err := h.failOrder(ctx, order.ID, "", "acct_vat_checkout"); err != nil {
			t.Fatal(err)
		}
	}
}
