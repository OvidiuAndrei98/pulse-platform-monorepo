package app

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// SetupRouter construiește arborele de rute partajat de ambele medii
func (app *Application) SetupRouter() http.Handler {
	r := chi.NewRouter()

	// Middleware-uri standard și utile
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// Endpoint-uri sistem
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		respondWithJSON(w, http.StatusOK, map[string]string{
			"status": "healthy",
			"time":   time.Now().Format(time.RFC3339),
		})
	})

	// Rutele aplicației (REST)
	r.Route("/api/v1", func(r chi.Router) {
		// --- USERS ---
		r.Route("/users", func(r chi.Router) {
			r.Post("/", app.HandleCreateUser)
			r.Get("/{id}", app.HandleGetUser)
		})

		// --- EVENTS ---
		r.Route("/events", func(r chi.Router) {
			r.Post("/", app.HandleCreateEvent)
			r.Get("/", app.HandleListEvents)
			r.Get("/{id}", app.HandleGetEventByID)
			r.Get("/live", app.HandleGetLiveEventsInArea)
		})

		// --- INTERACTIONS ---
		r.Route("/checkins", func(r chi.Router) {
			r.Post("/", app.HandleCreateCheckIn)
			r.Delete("/", app.HandleDeleteCheckIn)
		})

		r.Route("/comments", func(r chi.Router) {
			r.Post("/", app.HandleAddComment)
		})

		r.Route("/friends", func(r chi.Router) {
			r.Get("/{userId}", app.HandleGetFriends)
			r.Post("/request", app.HandleSendFriendRequest)
			r.Put("/respond", app.HandleRespondToFriendRequest)
		})
	})

	return r
}
