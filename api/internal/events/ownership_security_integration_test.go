package events

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func isolationTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("ISOLATION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set ISOLATION_TEST_DATABASE_URL to a migrated local spottr_security_test database")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal("invalid isolation test database config")
	}
	if cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-isolated test database")
	}
	pool, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	var eventsTable *string
	if err := pool.QueryRow(context.Background(), "SELECT to_regclass('public.events')::text").Scan(&eventsTable); err != nil || eventsTable == nil {
		t.Fatal("isolation test database must have all migrations applied")
	}
	return pool
}

type ownershipFixture struct {
	ownerID, otherOwnerID   pgtype.UUID
	eventID, otherEventID   pgtype.UUID
	ticketID, otherTicketID pgtype.UUID
}

func seedOwnershipFixture(t *testing.T, pool *pgxpool.Pool) ownershipFixture {
	t.Helper()
	ctx := context.Background()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	shortSuffix := suffix[len(suffix)-10:]
	var fixture ownershipFixture
	for index, destination := range []*pgtype.UUID{&fixture.ownerID, &fixture.otherOwnerID} {
		username := fmt.Sprintf("security-org-%d-%s", index, suffix)
		email := fmt.Sprintf("security-org-%d-%s@example.invalid", index, suffix)
		if err := pool.QueryRow(ctx, `INSERT INTO users (username,email,password_hash,role,is_active) VALUES ($1,$2,'not-used','organizer',TRUE) RETURNING id`, username, email).Scan(destination); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO organizer_profiles (user_id,cui,company_name,fiscal_address,is_verified,verification_status) VALUES ($1,$2,$3,'Test',TRUE,'approved')`, *destination, fmt.Sprintf("SEC%s%d", shortSuffix, index), username); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		if _, err := pool.Exec(context.Background(), "DELETE FROM events WHERE organizer_id=$1 OR organizer_id=$2", fixture.ownerID, fixture.otherOwnerID); err != nil {
			t.Error(err)
		}
		if _, err := pool.Exec(context.Background(), "DELETE FROM event_banner_assets WHERE owner_id=$1 OR owner_id=$2", fixture.ownerID, fixture.otherOwnerID); err != nil {
			t.Error(err)
		}
		if _, err := pool.Exec(context.Background(), "DELETE FROM users WHERE id=$1 OR id=$2", fixture.ownerID, fixture.otherOwnerID); err != nil {
			t.Error(err)
		}
	})

	start := time.Now().Add(24 * time.Hour)
	end := start.Add(3 * time.Hour)
	for index, pair := range []struct{ owner, event, ticket *pgtype.UUID }{
		{&fixture.ownerID, &fixture.eventID, &fixture.ticketID},
		{&fixture.otherOwnerID, &fixture.otherEventID, &fixture.otherTicketID},
	} {
		if err := pool.QueryRow(ctx, `INSERT INTO events (organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status) VALUES ($1,$2,'house','Venue','Bucuresti','social',44,26,$3,$4,'place','draft') RETURNING id`, *pair.owner, fmt.Sprintf("Original %d", index), start, end).Scan(pair.event); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, `INSERT INTO ticket_types (event_id,name,price_ron,capacity,start_sales,end_sales,description) VALUES ($1,$2,50,100,$3,$4,'Original') RETURNING id`, *pair.event, fmt.Sprintf("Original ticket %d", index), time.Now().Add(-time.Hour), end).Scan(pair.ticket); err != nil {
			t.Fatal(err)
		}
	}
	return fixture
}

func editEventRequest(t *testing.T, handler *Handler, ownerID, eventID pgtype.UUID, tickets []map[string]any, bannerURL string) *httptest.ResponseRecorder {
	t.Helper()
	start := time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339)
	end := time.Now().Add(27 * time.Hour).UTC().Format(time.RFC3339)
	payload := map[string]any{
		"title": "Changed", "category": "house", "startTime": start, "endTime": end,
		"locationName": "Venue", "city": "Bucuresti", "vibe": "social",
		"latitude": 44.0, "longitude": 26.0, "googlePlaceId": "place",
		"description": "Changed", "status": "draft", "vatPercentage": 21.0, "ticketTypes": tickets,
	}
	if bannerURL != "" {
		payload["bannerUrl"] = bannerURL
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest("POST", "/dashboard/events/"+eventID.String(), bytes.NewReader(body))
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("id", eventID.String())
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, routeContext)
	ctx = context.WithValue(ctx, auth.UserIDKey, ownerID.String())
	ctx = context.WithValue(ctx, auth.RoleKey, "organizer")
	w := httptest.NewRecorder()
	handler.HandleEditEvent(w, r.WithContext(ctx))
	return w
}

func ticketPayload(id, name string) map[string]any {
	return map[string]any{
		"id": id, "name": name, "priceRon": 60, "capacity": 100,
		"description": "Changed", "startSales": time.Now().Add(-time.Hour).UTC().Format(time.RFC3339),
		"endSales": time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339),
	}
}

func TestEditEventRejectsForeignAndMalformedTicketIDsAtomically(t *testing.T) {
	pool := isolationTestPool(t)
	fixture := seedOwnershipFixture(t, pool)
	handler := NewHandler(db.New(pool), pool)
	t.Setenv("PUBLIC_API_URL", "https://api.spottr.test")
	filename := "0123456789abcdef0123456789abcdef.jpg"
	foreignBanner := "https://api.spottr.test/api/v1/media/events/" + fixture.otherOwnerID.String() + "/" + filename

	foreignAsset := editEventRequest(t, handler, fixture.ownerID, fixture.eventID, nil, foreignBanner)
	if foreignAsset.Code != 400 {
		t.Fatalf("foreign banner returned %d: %s", foreignAsset.Code, foreignAsset.Body.String())
	}
	assertOwnershipFixtureUnchanged(t, pool, fixture)

	foreign := editEventRequest(t, handler, fixture.ownerID, fixture.eventID, []map[string]any{
		ticketPayload(fixture.ticketID.String(), "Own changed first"),
		ticketPayload(fixture.otherTicketID.String(), "Foreign changed"),
	}, "")
	if foreign.Code != 400 {
		t.Fatalf("foreign ticket ID returned %d: %s", foreign.Code, foreign.Body.String())
	}
	assertOwnershipFixtureUnchanged(t, pool, fixture)

	malformed := editEventRequest(t, handler, fixture.ownerID, fixture.eventID, []map[string]any{
		ticketPayload("not-a-uuid", "Must not become a new ticket"),
	}, "")
	if malformed.Code != 400 {
		t.Fatalf("malformed ticket ID returned %d: %s", malformed.Code, malformed.Body.String())
	}
	assertOwnershipFixtureUnchanged(t, pool, fixture)

	ownedKey := "events/" + fixture.ownerID.String() + "/" + filename
	var ownedAssetID pgtype.UUID
	if err := pool.QueryRow(context.Background(), `
		INSERT INTO event_banner_assets (owner_id, s3_key, status, delete_after)
		VALUES ($1, $2, 'ready', clock_timestamp() + interval '72 hours')
		RETURNING id`, fixture.ownerID, ownedKey).Scan(&ownedAssetID); err != nil {
		t.Fatal(err)
	}
	valid := editEventRequest(t, handler, fixture.ownerID, fixture.eventID, []map[string]any{
		ticketPayload(fixture.ticketID.String(), "Valid own update"),
	}, "https://api.spottr.test/api/v1/media/events/"+fixture.ownerID.String()+"/"+filename)
	if valid.Code != 200 {
		t.Fatalf("owned ticket update returned %d: %s", valid.Code, valid.Body.String())
	}
	var name, bannerURL string
	if err := pool.QueryRow(context.Background(), "SELECT name FROM ticket_types WHERE id=$1", fixture.ticketID).Scan(&name); err != nil || name != "Valid own update" {
		t.Fatal("owned update was not persisted", err)
	}
	if err := pool.QueryRow(context.Background(), "SELECT banner_url FROM events WHERE id=$1", fixture.eventID).Scan(&bannerURL); err != nil || bannerURL != "https://api.spottr.test/api/v1/media/events/"+fixture.ownerID.String()+"/"+filename {
		t.Fatal("owned banner was not persisted", err)
	}
	var referencedAssetID pgtype.UUID
	var deleteAfter *time.Time
	if err := pool.QueryRow(context.Background(), `
		SELECT reference.asset_id, asset.delete_after
		FROM event_banner_references reference
		JOIN event_banner_assets asset ON asset.id=reference.asset_id
		WHERE reference.event_id=$1`, fixture.eventID).Scan(&referencedAssetID, &deleteAfter); err != nil {
		t.Fatal(err)
	}
	if referencedAssetID != ownedAssetID || deleteAfter != nil {
		t.Fatal("owned banner was not atomically referenced and activated")
	}
}

func assertOwnershipFixtureUnchanged(t *testing.T, pool *pgxpool.Pool, fixture ownershipFixture) {
	t.Helper()
	var title, ownTicket, foreignTicket string
	var ticketCount int
	if err := pool.QueryRow(context.Background(), "SELECT title FROM events WHERE id=$1", fixture.eventID).Scan(&title); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), "SELECT name FROM ticket_types WHERE id=$1", fixture.ticketID).Scan(&ownTicket); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), "SELECT name FROM ticket_types WHERE id=$1", fixture.otherTicketID).Scan(&foreignTicket); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(context.Background(), "SELECT count(*) FROM ticket_types WHERE event_id=$1", fixture.eventID).Scan(&ticketCount); err != nil {
		t.Fatal(err)
	}
	if title != "Original 0" || ownTicket != "Original ticket 0" || foreignTicket != "Original ticket 1" || ticketCount != 1 {
		t.Fatalf("rejected edit changed data: title=%q own=%q foreign=%q count=%d", title, ownTicket, foreignTicket, ticketCount)
	}
}
