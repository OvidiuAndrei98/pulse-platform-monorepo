package router

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// HandlersConfig colectează toate funcțiile HTTP și middleware-urile necesare.
type HandlersConfig struct {
	// Auth Middleware
	AuthMiddleware func(http.Handler) http.Handler

	// Auth
	Register http.HandlerFunc
	Activate http.HandlerFunc
	Login    http.HandlerFunc

	// Users
	GetMe      http.HandlerFunc
	CreateUser http.HandlerFunc
	GetUser    http.HandlerFunc

	// Events
	CreateEvent         http.HandlerFunc
	ListEvents          http.HandlerFunc
	GetEventByID        http.HandlerFunc
	GetLiveEventsInArea http.HandlerFunc
	DeleteEvent         http.HandlerFunc

	// Interactions / Checkins
	CreateCheckIn http.HandlerFunc
	DeleteCheckIn http.HandlerFunc

	// Comments
	AddComment http.HandlerFunc

	// Friends
	GetFriends             http.HandlerFunc
	SendFriendRequest      http.HandlerFunc
	RespondToFriendRequest http.HandlerFunc
}

func SetupRouter(cfg HandlersConfig) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		RespondWithJSON(w, http.StatusOK, map[string]string{
			"status": "healthy",
			"time":   time.Now().Format(time.RFC3339),
		})
	})

	r.Route("/api/v1", func(r chi.Router) {

		// --- AUTH (Rute Publice) ---
		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", cfg.Login)
			r.Post("/register", cfg.Register)
			if cfg.Activate != nil {
				r.Get("/activate", cfg.Activate)
			}
		})

		// --- RUTE PROTEJATE ---
		r.Group(func(r chi.Router) {
			if cfg.AuthMiddleware != nil {
				r.Use(cfg.AuthMiddleware)
			}

			// --- USERS ---
			r.Route("/users", func(r chi.Router) {
				r.Get("/me", cfg.GetMe)
				r.Post("/", cfg.CreateUser)
				r.Get("/{id}", cfg.GetUser)
			})

			// --- EVENTS ---
			r.Route("/events", func(r chi.Router) {
				r.Post("/", cfg.CreateEvent)
				r.Get("/", cfg.ListEvents)
				r.Get("/{id}", cfg.GetEventByID)
				r.Get("/live", cfg.GetLiveEventsInArea)
				if cfg.DeleteEvent != nil {
					r.Delete("/{id}", cfg.DeleteEvent)
				}
			})

			// --- INTERACTIONS ---
			r.Route("/checkins", func(r chi.Router) {
				r.Post("/", cfg.CreateCheckIn)
				r.Delete("/", cfg.DeleteCheckIn)
			})

			r.Route("/comments", func(r chi.Router) {
				r.Post("/", cfg.AddComment)
			})

			r.Route("/friends", func(r chi.Router) {
				r.Get("/{userId}", cfg.GetFriends)
				r.Post("/request", cfg.SendFriendRequest)
				r.Put("/respond", cfg.RespondToFriendRequest)
			})
		})
	})

	return r
}
