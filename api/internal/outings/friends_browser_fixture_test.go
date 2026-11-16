package outings

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/events"
	"pulse-api/internal/interactions"
	"pulse-api/internal/payments"
	"pulse-api/internal/router"
	"pulse-api/internal/tickets"
)

// Explicitly opt-in browser fixture. It serves real production group/event/feed
// handlers over loopback against testPool's isolated database. The two local
// bearer tokens replace JWT login only; every group and outing operation still
// executes its real membership/coordinator checks and PostgreSQL transaction.
func TestFriendsBrowserFixtureServer(t *testing.T) {
	if os.Getenv("SPOTTR_FRIENDS_BROWSER_FIXTURE") != "1" {
		t.Skip("opt-in loopback browser fixture")
	}
	f := seed(t)
	listener, err := net.Listen("tcp4", "127.0.0.1:8086")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { listener.Close() })
	base := "http://127.0.0.1:8086"
	media := base + "/__fixture/party.webp"
	names := []string{"QA Ana Creator", "QA Radu Member", "QA Mara Invited"}
	for i := range names {
		names[i] += " " + sid(f.users[i])[:8]
	}
	for i, name := range names {
		mustExec(t, f.pool, `UPDATE users SET username=$2,avatar_url=$3,show_attendance_publicly=TRUE WHERE id=$1`, f.users[i], name, media)
	}
	day := time.Now().In(planningZone).AddDate(0, 0, 3).Format("2006-01-02")
	start, _ := time.ParseInLocation("2006-01-02 15:04", day+" 20:00", planningZone)
	for i, event := range []pgtype.UUID{f.event, f.otherEvent} {
		name := "QA · After Dark"
		if i == 1 {
			name = "QA · Roof Top"
		}
		mustExec(t, f.pool, `UPDATE events SET title=$2,description='Synthetic event for local Friends QA only.',banner_url=$3,start_time=$4,end_time=$5 WHERE id=$1`, event, name, media, start.Add(time.Duration(i)*time.Hour), start.Add(8*time.Hour))
	}
	mustExec(t, f.pool, `INSERT INTO organizer_profiles(user_id,cui,company_name,fiscal_address,is_verified,verification_status) VALUES($1,$2,'Local QA only','Local QA only',TRUE,'approved')`, f.users[2], "QA"+sid(f.users[2])[:12])
	freeTier := rowID(t, f.pool, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales) VALUES($1,'Free registration',0,40,now()-interval '1 day',$2) RETURNING id`, f.otherEvent, start.Add(7*time.Hour))
	t.Cleanup(func() {
		mustExec(t, f.pool, `DELETE FROM notifications WHERE event_id=$1`, f.otherEvent)
		mustExec(t, f.pool, `DELETE FROM orders WHERE event_id=$1`, f.otherEvent)
		mustExec(t, f.pool, `DELETE FROM ticket_types WHERE id=$1`, freeTier)
	})
	// Browser suites need separate event ownership states, without editing each
	// other's purchased tickets. These remain scoped to this isolated fixture.
	makeExtraFreeEvent := func(name string) (pgtype.UUID, pgtype.UUID) {
		event := rowID(t, f.pool, `INSERT INTO events(organizer_id,title,description,category,banner_url,location_address,location_name,city,vibe,latitude,longitude,start_time,end_time,status)
 SELECT organizer_id,$2,description,category,banner_url,location_address,location_name,city,vibe,latitude,longitude,start_time,end_time,status FROM events WHERE id=$1 RETURNING id`, f.otherEvent, name)
		tier := rowID(t, f.pool, `INSERT INTO ticket_types(event_id,name,price_ron,capacity,start_sales,end_sales) SELECT $1,'Free registration',0,40,start_sales,end_sales FROM ticket_types WHERE id=$2 RETURNING id`, event, freeTier)
		t.Cleanup(func() {
			mustExec(t, f.pool, `DELETE FROM notifications WHERE event_id=$1`, event)
			mustExec(t, f.pool, `DELETE FROM outing_ticket_recipients WHERE event_id=$1`, event)
			mustExec(t, f.pool, `DELETE FROM orders WHERE event_id=$1`, event)
			mustExec(t, f.pool, `DELETE FROM events WHERE id=$1`, event)
		})
		return event, tier
	}
	nativeFreeEvent, nativeFreeTier := makeExtraFreeEvent("QA Native Separate free registration")
	webFreeEvent, webFreeTier := makeExtraFreeEvent("QA Web Separate free registration")
	g := makeGroup(t, f, true)
	// Browser QA may create additional groups using these synthetic actors.
	// Clean only those actors' fixture groups before seed's users/events cleanup.
	t.Cleanup(func() {
		for _, sql := range []string{
			`DELETE FROM notifications WHERE friend_group_id IN(SELECT id FROM friend_groups WHERE created_by=ANY($1))`,
			`DELETE FROM friend_group_messages WHERE group_id IN(SELECT id FROM friend_groups WHERE created_by=ANY($1))`,
			`DELETE FROM outing_attendance WHERE plan_id IN(SELECT p.id FROM outing_plans p JOIN friend_groups g ON g.id=p.group_id WHERE g.created_by=ANY($1))`,
			`DELETE FROM outing_plans WHERE group_id IN(SELECT id FROM friend_groups WHERE created_by=ANY($1))`,
			`DELETE FROM friend_group_members WHERE group_id IN(SELECT id FROM friend_groups WHERE created_by=ANY($1))`,
			`DELETE FROM friend_groups WHERE created_by=ANY($1)`,
		} {
			mustExec(t, f.pool, sql, f.users[:])
		}
	})
	want(t, f.call("POST", "/groups/"+g.ID+"/actions", map[string]string{"action": "rename", "name": "QA · Weekend friends"}, f.users[0]), 200)
	mustExec(t, f.pool, `INSERT INTO friendships(user_id,friend_id,status) VALUES($1,$2,'accepted')`, f.users[0], f.users[2])
	want(t, f.call("POST", "/groups/"+g.ID+"/actions", map[string]string{"action": "invite", "userId": sid(f.users[2])}, f.users[0]), 200)
	want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "Found a night for us. What do you think?"}, f.users[0]), 201)
	want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "", "eventId": sid(f.event)}, f.users[0]), 201)
	p := createOuting(t, f, g, f.users[0], map[string]any{"date": day, "city": "Bucuresti"})
	for _, event := range []pgtype.UUID{f.event, f.otherEvent} {
		want(t, f.call("POST", "/plans/"+p.ID+"/proposals", map[string]any{"eventId": sid(event)}, f.users[0]), 200)
	}
	want(t, f.call("POST", "/groups/"+g.ID+"/messages", map[string]any{"requestId": key(t, f), "content": "Both look good. I'll choose my preference here."}, f.users[1]), 201)
	later := start.AddDate(0, 0, 7).Format("2006-01-02")
	later2 := start.AddDate(0, 0, 8).Format("2006-01-02")
	flexible := createOuting(t, f, g, f.users[1], map[string]any{"dates": []string{later, later2}, "city": "Bucuresti"})
	tokens := map[string]pgtype.UUID{"spottr-local-qa-creator": f.users[0], "spottr-local-qa-member": f.users[1], "spottr-local-qa-pending": f.users[2]}
	query := db.New(f.pool)
	ev := events.NewHandler(query, f.pool)
	social := interactions.NewHandler(query)
	ticketHandler := tickets.NewHandler(query, f.pool, base)
	checkout := payments.NewCheckoutHandler(query, f.pool, "", base, nil, nil, nil)
	mux := chi.NewRouter()
	done := make(chan struct{}, 1)
	mux.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:") {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID, Cache-Control, Idempotency-Key")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			}
			if r.Method == "OPTIONS" {
				w.WriteHeader(204)
				return
			}
			next.ServeHTTP(w, r)
		})
	})
	mux.Get("/__fixture/party.webp", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join("..", "..", "..", "apps", "spottr-native", "assets", "party-event.webp"))
	})
	mux.Get("/__fixture/status", func(w http.ResponseWriter, r *http.Request) {
		router.RespondWithJSON(w, 200, map[string]any{"testOnly": true, "database": "spottr_security_test"})
	})
	mux.Post("/__fixture/stop", func(w http.ResponseWriter, r *http.Request) {
		select {
		case done <- struct{}{}:
		default:
		}
		w.WriteHeader(204)
	})
	mux.Route("/api/v1", func(r chi.Router) {
		r.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				actor, ok := tokens[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")]
				if !ok {
					router.RespondWithError(w, 401, "Local QA token required")
					return
				}
				next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), auth.UserIDKey, sid(actor))))
			})
		})
		r.Mount("/outings", f.handler.Routes())
		r.Get("/events", ev.HandleListEvents)
		r.Get("/events/{id}", ev.HandleGetEventByID)
		r.Get("/events/{id}/social", social.HandleGetEventSocial)
		r.Get("/events/{id}/attendees", social.HandleGetEventAttendees)
		r.Get("/events/{id}/tickets", ticketHandler.HandleGetTicketTypesForEvent)
		r.Post("/events/{id}/tickets/book", checkout.HandleBookFreeTicket)
		// Deliberately no Stripe credentials: this real handler returns its
		// explicit configuration error before contacting any payment provider.
		r.Post("/events/{id}/tickets/purchase", checkout.HandleCreateCheckout)
		r.Post("/checkout/recover", checkout.HandleRecoverCheckout)
		r.Get("/users/me/tickets", ticketHandler.HandleGetUserTickets)
		r.Get("/users/me/orders", ticketHandler.HandleGetUserOrders)
		r.Get("/friends", social.HandleGetFriends)
		r.Get("/friends/requests", social.HandleGetFriendRequests)
		r.Get("/feed", social.HandleGetSocialFeed)
	})
	actors := []map[string]string{}
	for i, token := range []string{"spottr-local-qa-creator", "spottr-local-qa-member", "spottr-local-qa-pending"} {
		actors = append(actors, map[string]string{"id": sid(f.users[i]), "email": f.emails[i], "token": token, "username": names[i], "avatarUrl": media})
	}
	data, _ := json.MarshalIndent(map[string]any{"testOnly": true, "baseUrl": base, "groupId": g.ID, "planId": p.ID, "availabilityPlanId": flexible.ID, "night": day, "availabilityNights": []string{later, later2}, "eventIds": []string{sid(f.event), sid(f.otherEvent)}, "freeEventId": sid(f.otherEvent), "freeTicketTypeId": sid(freeTier), "nativeFreeEventId": sid(nativeFreeEvent), "nativeFreeTicketTypeId": sid(nativeFreeTier), "webFreeEventId": sid(webFreeEvent), "webFreeTicketTypeId": sid(webFreeTier), "actors": actors}, "", "  ")
	path := filepath.Join("..", "..", ".tmp", "friends-browser-fixture.json")
	if err = os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	for name, ids := range map[string][2]pgtype.UUID{"native": {nativeFreeEvent, nativeFreeTier}, "web": {webFreeEvent, webFreeTier}} {
		extra, marshalErr := json.MarshalIndent(map[string]any{"testOnly": true, "sourceGroupId": g.ID, "eventId": sid(ids[0]), "ticketTypeId": sid(ids[1])}, "", "  ")
		if marshalErr != nil {
			t.Fatal(marshalErr)
		}
		if err = os.WriteFile(filepath.Join("..", "..", ".tmp", "friends-browser-"+name+"-extra.json"), extra, 0600); err != nil {
			t.Fatal(err)
		}
	}
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = server.Serve(listener) }()
	t.Log("Local Friends fixture ready on 127.0.0.1:8086; metadata in api/.tmp/friends-browser-fixture.json")
	select {
	case <-done:
	case <-time.After(45 * time.Minute):
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
}
