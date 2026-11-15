package outings

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
	"pulse-api/internal/events"
)

func catalogAs(t *testing.T, f fixture, params url.Values) []events.EventResponse {
	t.Helper()
	handler := events.NewHandler(db.New(f.pool), f.pool)
	r := request("GET", "/events?"+params.Encode(), nil, f.users[0])
	w := httptest.NewRecorder()
	handler.HandleListEvents(w, r)
	if w.Code != 200 {
		t.Fatalf("catalog %d %s", w.Code, w.Body.String())
	}
	var rows []events.EventResponse
	if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil {
		t.Fatal(err)
	}
	return rows
}
func cleanupCatalogEvents(t *testing.T, f fixture) {
	t.Helper()
	t.Cleanup(func() {
		mustExec(t, f.pool, `DELETE FROM events WHERE organizer_id=$1 AND id<>$2 AND id<>$3`, f.users[2], f.event, f.otherEvent)
	})
}
func catalogEvent(t *testing.T, f fixture, title, city string, start, end time.Time) pgtype.UUID {
	t.Helper()
	return rowID(t, f.pool, `INSERT INTO events(organizer_id,title,category,location_name,city,vibe,latitude,longitude,start_time,end_time,google_place_id,status) VALUES($1,$2,'house','Venue',$3,'social',44,26,$4,$5,'catalog-test','published') RETURNING id`, f.users[2], title, city, start, end)
}

func TestCatalogNightAndGroupEligibilityUseSameBoundariesAndCity(t *testing.T) {
	f := seed(t)
	cleanupCatalogEvents(t, f)
	day := time.Now().In(planningZone).AddDate(0, 0, 4).Format("2006-01-02")
	start, end, err := nightBounds(day)
	if err != nil {
		t.Fatal(err)
	}
	prefix := "night-boundary-" + sid(f.users[2])
	ids := map[string]bool{}
	samples := []struct {
		at       time.Time
		eligible bool
	}{{start.Add(-time.Minute), false}, {start, true}, {start.Add(17 * time.Hour), true}, {end.Add(-5 * time.Hour), true}, {end.Add(-time.Minute), true}, {end, false}, {end.Add(16 * time.Hour), false}}
	for i, sample := range samples {
		id := catalogEvent(t, f, fmt.Sprintf("%s-%d", prefix, i), "București", sample.at, sample.at.Add(2*time.Hour))
		ids[sid(id)] = sample.eligible
	}
	// Empty text is a real list load. The query's canonical city spelling differs
	// from the stored display label, reproducing the captured ROOF TOP failure.
	params := url.Values{"nightDate": {day}, "city": {"Bucuresti"}, "q": {prefix}, "page": {"1"}}
	got := catalogAs(t, f, params)
	if len(got) != 4 {
		t.Fatalf("strict night results %d; expected four boundary occurrences", len(got))
	}
	seen := map[string]bool{}
	for _, event := range got {
		seen[event.ID] = true
		if !ids[event.ID] {
			t.Fatal("catalog included an incompatible occurrence", event.ID)
		}
		id, _ := uuid(event.ID)
		fits, err := eventFitsPlan(context.Background(), f.pool, id, day, "Bucuresti")
		if err != nil || !fits {
			t.Fatal("selector and proposal server eligibility differ", err)
		}
	}
	for id, eligible := range ids {
		if seen[id] != eligible {
			t.Fatalf("boundary occurrence %s eligible=%v got=%v", id, eligible, seen[id])
		}
	}
	params.Set("city", "București")
	accented := catalogAs(t, f, params)
	if len(accented) != len(got) {
		t.Fatal("display diacritics lost eligible events")
	}
	params.Set("q", "")
	all := catalogAs(t, f, params)
	found := map[string]bool{}
	for _, event := range all {
		found[event.ID] = true
	}
	for id, eligible := range ids {
		if eligible && !found[id] {
			t.Fatal("empty search did not load an eligible occurrence")
		}
	}
	params.Set("startsAfter", start.Format(time.RFC3339))
	handler := events.NewHandler(db.New(f.pool), f.pool)
	w := httptest.NewRecorder()
	handler.HandleListEvents(w, request("GET", "/events?"+params.Encode(), nil, f.users[0]))
	if w.Code != 400 {
		t.Fatal("ambiguous night/overlap request accepted")
	}
}

func TestCatalogNightFilterPrecedesPagination(t *testing.T) {
	f := seed(t)
	cleanupCatalogEvents(t, f)
	day := time.Now().In(planningZone).AddDate(0, 0, 6).Format("2006-01-02")
	start, end, _ := nightBounds(day)
	prefix := "paged-night-" + sid(f.users[2])
	for i := range 25 {
		catalogEvent(t, f, fmt.Sprintf("%s-event-%02d", prefix, i), "Iasi", start.Add(time.Duration(i)*time.Minute), end.Add(time.Hour))
	}
	for i := range 25 {
		catalogEvent(t, f, fmt.Sprintf("%s-overlap-%02d", prefix, i), "Iași", start.AddDate(0, 0, -2).Add(time.Duration(i)*time.Minute), end.Add(time.Hour))
	}
	params := url.Values{"nightDate": {day}, "city": {"Iași"}, "q": {prefix}, "page": {"1"}}
	first := catalogAs(t, f, params)
	params.Set("page", "2")
	second := catalogAs(t, f, params)
	params.Set("page", "3")
	third := catalogAs(t, f, params)
	if len(first) != 20 || len(second) != 5 || len(third) != 0 {
		t.Fatalf("eligible catalog pagination: %d/%d/%d", len(first), len(second), len(third))
	}
	seen := map[string]bool{}
	for _, event := range append(first, second...) {
		if seen[event.ID] {
			t.Fatal("page duplicated an occurrence")
		}
		seen[event.ID] = true
		if event.StartTime.Before(start) || !event.StartTime.Before(end) {
			t.Fatal("overlap-only event filled eligible page")
		}
	}
}
