package router

import (
	"net/http"
	"time"

	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// HandlersConfig colectează toate funcțiile HTTP și middleware-urile necesare.
type HandlersConfig struct {
	// Middleware-uri de autentificare și autorizare
	AuthMiddleware         func(http.Handler) http.Handler
	OptionalAuthMiddleware func(http.Handler) http.Handler
	ScannerAuthMiddleware  func(http.Handler) http.Handler
	OrganizerMiddleware    func(http.Handler) http.Handler // RequireRole("organizer", "admin")
	AdminMiddleware        func(http.Handler) http.Handler // RequireRole("admin")

	// Auth
	Register             http.HandlerFunc
	Activate             http.HandlerFunc
	Login                http.HandlerFunc
	GoogleLogin          http.HandlerFunc
	GoogleCallback       http.HandlerFunc
	SearchSpotifyArtists http.HandlerFunc
	ForgotPassword       http.HandlerFunc
	ResetPassword        http.HandlerFunc

	// Users
	GetMe                    http.HandlerFunc
	UpdateMe                 http.HandlerFunc
	UploadUserAvatar         http.HandlerFunc
	CreateUser               http.HandlerFunc
	GetUser                  http.HandlerFunc
	GetUserTickets           http.HandlerFunc
	GetUserOrders            http.HandlerFunc
	GetSavedEvents           http.HandlerFunc
	ListNotifications        http.HandlerFunc
	MarkAllNotificationsRead http.HandlerFunc
	MarkNotificationRead     http.HandlerFunc

	// Events
	CreateEvent                http.HandlerFunc
	ListEvents                 http.HandlerFunc
	GetEventByID               http.HandlerFunc
	GetEventWithStats          http.HandlerFunc
	GetLiveEventsInArea        http.HandlerFunc
	DeleteEvent                http.HandlerFunc
	EditEvent                  http.HandlerFunc
	ListEventsWithStats        http.HandlerFunc
	UploadEventBanner          http.HandlerFunc
	UploadOrganizerUpdateImage http.HandlerFunc
	GetEventBanner             http.HandlerFunc
	GetEventUpdates            http.HandlerFunc
	GetOrganizerUpdates        http.HandlerFunc
	CreateEventUpdate          http.HandlerFunc
	DeleteEventUpdate          http.HandlerFunc
	SaveEvent                  http.HandlerFunc
	RemoveSavedEvent           http.HandlerFunc
	StripeWebhook              http.HandlerFunc
	StripeConnectWebhook       http.HandlerFunc
	CreateStripeAccountLink    http.HandlerFunc
	GetStripeAccountStatus     http.HandlerFunc
	CreateStripeLoginLink      http.HandlerFunc
	GetEventSocial             http.HandlerFunc
	UpdateEventRsvp            http.HandlerFunc
	DeleteEventRsvp            http.HandlerFunc

	// Interactions / Checkins
	CreateCheckIn http.HandlerFunc
	DeleteCheckIn http.HandlerFunc

	// Comments
	AddComment  http.HandlerFunc
	GetComments http.HandlerFunc

	// Friends
	GetFriends             http.HandlerFunc
	SendFriendRequest      http.HandlerFunc
	RespondToFriendRequest http.HandlerFunc
	RemoveFriend           http.HandlerFunc
	GetFriendRequests      http.HandlerFunc
	ConnectWithFriend      http.HandlerFunc
	SearchProfiles         http.HandlerFunc
	GetPublicProfile       http.HandlerFunc
	FollowOrganizer        http.HandlerFunc
	UnfollowOrganizer      http.HandlerFunc
	GetEventAttendees      http.HandlerFunc
	GetSocialFeed          http.HandlerFunc

	// Organizer
	GetOrganizerProfile      http.HandlerFunc
	CreateOrganizerProfile   http.HandlerFunc
	AcceptOrganizerAgreement http.HandlerFunc
	GetOrganizerFinance      http.HandlerFunc

	// Tickets
	GetEventTicketTypes   http.HandlerFunc
	CreateTicketType      http.HandlerFunc
	PurchaseTickets       http.HandlerFunc
	ValidateTicket        http.HandlerFunc
	ListValidationEvents  http.HandlerFunc
	ListMyValidationScans http.HandlerFunc
	ListValidationStaff   http.HandlerFunc
	AddValidationStaff    http.HandlerFunc
	RemoveValidationStaff http.HandlerFunc
	CreateScannerAccess   http.HandlerFunc
	ListScannerAccess     http.HandlerFunc
	RevokeScannerAccess   http.HandlerFunc
	CreateScannerSession  http.HandlerFunc
	QuickValidateTicket   http.HandlerFunc
	CreateOfflineSnapshot http.HandlerFunc
	SyncOfflineScans      http.HandlerFunc
}

func SetupRouter(cfg HandlersConfig) http.Handler {
	allowedOrigins := []string{
		"http://localhost:3000",
		"http://localhost",
		"https://localhost",
		"capacitor://localhost",
	}

	if configuredOrigins := os.Getenv("CORS_ALLOWED_ORIGINS"); configuredOrigins != "" {
		for _, origin := range strings.Split(configuredOrigins, ",") {
			if origin = strings.TrimSpace(origin); origin != "" {
				allowedOrigins = append(allowedOrigins, origin)
			}
		}
	}

	r := chi.NewRouter()
	optionalAuthMiddleware := cfg.OptionalAuthMiddleware
	if optionalAuthMiddleware == nil {
		optionalAuthMiddleware = func(next http.Handler) http.Handler { return next }
	}

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
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
		r.Get("/media/*", cfg.GetEventBanner)
		r.Post("/stripe/webhook", cfg.StripeWebhook)
		r.Post("/stripe/connect/webhook", cfg.StripeConnectWebhook)
		r.Post("/ticket-validation/quick-access/session", cfg.CreateScannerSession)
		r.Group(func(r chi.Router) {
			if cfg.ScannerAuthMiddleware != nil {
				r.Use(cfg.ScannerAuthMiddleware)
			}
			r.Post("/ticket-validation/quick-access/validate", cfg.QuickValidateTicket)
		})

		// --- AUTH (Public) ---
		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", cfg.Login)
			if cfg.GoogleLogin != nil && cfg.GoogleCallback != nil {
				r.Get("/google", cfg.GoogleLogin)
				r.Get("/google/callback", cfg.GoogleCallback)
			}
			r.Post("/register", cfg.Register)
			r.Post("/forgot-password", cfg.ForgotPassword)
			r.Post("/reset-password", cfg.ResetPassword)
			if cfg.Activate != nil {
				r.Get("/activate", cfg.Activate)
			}
		})

		r.Route("/profiles", func(r chi.Router) {
			r.With(optionalAuthMiddleware).Get("/search", cfg.SearchProfiles)
			r.With(optionalAuthMiddleware).Get("/{id}", cfg.GetPublicProfile)
		})

		if cfg.SearchSpotifyArtists != nil {
			r.Get("/spotify/search", cfg.SearchSpotifyArtists)
		}

		// --- EVENTS: Citire publică (nu necesită autentificare) ---
		r.Route("/events", func(r chi.Router) {
			r.With(optionalAuthMiddleware).Get("/", cfg.ListEvents)
			r.With(optionalAuthMiddleware).Get("/map", cfg.GetLiveEventsInArea)
			r.With(optionalAuthMiddleware).Get("/{id}", cfg.GetEventByID)
			r.With(optionalAuthMiddleware).Get("/{id}/social", cfg.GetEventSocial)
			r.With(optionalAuthMiddleware).Get("/{id}/attendees", cfg.GetEventAttendees)
			r.Get("/{id}/updates", cfg.GetEventUpdates)
			r.Get("/{id}/comments", cfg.GetComments)
			r.Get("/{id}/ticket-types", cfg.GetEventTicketTypes)
			r.With(optionalAuthMiddleware).Post("/{id}/tickets/purchase", cfg.PurchaseTickets)
		})
		r.Get("/organizers/{id}/updates", cfg.GetOrganizerUpdates)

		// --- RUTE PROTEJATE: Utilizatori autentificați ---
		r.Group(func(r chi.Router) {
			if cfg.AuthMiddleware != nil {
				r.Use(cfg.AuthMiddleware)
			}

			// --- USERS ---
			r.Route("/users", func(r chi.Router) {
				r.Post("/", cfg.CreateUser)
				r.Get("/me", cfg.GetMe)
				r.Put("/me", cfg.UpdateMe)
				r.Post("/me/avatar", cfg.UploadUserAvatar)
				r.Get("/me/tickets", cfg.GetUserTickets)
				r.Get("/me/orders", cfg.GetUserOrders)
				r.Get("/me/saved-events", cfg.GetSavedEvents)
				r.Get("/{id}", cfg.GetUser)
			})

			r.Route("/notifications", func(r chi.Router) {
				r.Get("/", cfg.ListNotifications)
				r.Post("/read-all", cfg.MarkAllNotificationsRead)
				r.Post("/{id}/read", cfg.MarkNotificationRead)
			})

			// --- INTERACȚIUNI EVENIMENTE (orice utilizator autentificat) ---
			r.Post("/events/{id}/check-in", cfg.CreateCheckIn)
			r.Post("/events/{id}/comments", cfg.AddComment)
			r.Post("/events/{id}/favorite", cfg.SaveEvent)
			r.Delete("/events/{id}/favorite", cfg.RemoveSavedEvent)
			r.Put("/events/{id}/rsvp", cfg.UpdateEventRsvp)
			r.Delete("/events/{id}/rsvp", cfg.DeleteEventRsvp)

			// --- FRIENDS ---
			r.Route("/friends", func(r chi.Router) {
				r.Get("/", cfg.GetFriends)
				r.Post("/request/{userId}", cfg.SendFriendRequest)
				r.Put("/request/{userId}", cfg.RespondToFriendRequest)
				r.Delete("/{userId}", cfg.RemoveFriend)
				r.Post("/connect/{userId}", cfg.ConnectWithFriend)
				r.Get("/requests", cfg.GetFriendRequests)
			})

			r.Get("/feed", cfg.GetSocialFeed)
			r.Post("/organizers/{userId}/follow", cfg.FollowOrganizer)
			r.Delete("/organizers/{userId}/follow", cfg.UnfollowOrganizer)

			// Organizatorii isi gestioneaza echipa, iar conturile invitate valideaza doar evenimentele atribuite.
			r.Route("/dashboard/ticket-validation", func(r chi.Router) {
				r.Get("/events", cfg.ListValidationEvents)
				r.Get("/events/{id}/my-scans", cfg.ListMyValidationScans)
				r.Get("/events/{id}/staff", cfg.ListValidationStaff)
				r.Post("/events/{id}/staff", cfg.AddValidationStaff)
				r.Delete("/events/{id}/staff/{userId}", cfg.RemoveValidationStaff)
				r.Get("/events/{id}/quick-access", cfg.ListScannerAccess)
				r.Post("/events/{id}/quick-access", cfg.CreateScannerAccess)
				r.Delete("/events/{id}/quick-access/{accessId}", cfg.RevokeScannerAccess)
				r.Post("/events/{id}/tickets/validate", cfg.ValidateTicket)
				r.Post("/events/{id}/offline-snapshot", cfg.CreateOfflineSnapshot)
				r.Post("/events/{id}/offline-sync", cfg.SyncOfflineScans)
			})

			// --- ORGANIZER+ ONLY: Creare/ștergere evenimente ---
			r.Group(func(r chi.Router) {
				if cfg.OrganizerMiddleware != nil {
					r.Use(cfg.OrganizerMiddleware)
				}

				// --- ORGANIZER DASHBOARD ---
				r.Post("/dashboard/uploads/event-banner", cfg.UploadEventBanner)
				r.Post("/dashboard/uploads/organizer-update", cfg.UploadOrganizerUpdateImage)
				r.Route("/dashboard/events", func(r chi.Router) {
					r.Get("/", cfg.ListEventsWithStats)
					r.Post("/", cfg.CreateEvent)
					if cfg.DeleteEvent != nil {
						r.Delete("/{id}", cfg.DeleteEvent)
					}
					r.Post("/{id}", cfg.EditEvent)
					r.Get("/{id}", cfg.GetEventWithStats)
					r.Post("/{id}/ticket-types", cfg.CreateTicketType)
					r.Get("/{id}/updates", cfg.GetEventUpdates)
					r.Post("/{id}/updates", cfg.CreateEventUpdate)
					r.Delete("/{id}/updates/{updateId}", cfg.DeleteEventUpdate)
				})

				// --- ORGANIZER PROFILE ---
				r.Get("/dashboard/finance", cfg.GetOrganizerFinance)
				r.Post("/dashboard/organizer/profile", cfg.CreateOrganizerProfile)
				r.Get("/dashboard/organizer/profile/{id}", cfg.GetOrganizerProfile)
				r.Post("/dashboard/organizer/agreement", cfg.AcceptOrganizerAgreement)
				r.Post("/dashboard/stripe/account-link", cfg.CreateStripeAccountLink)
				r.Get("/dashboard/stripe/status", cfg.GetStripeAccountStatus)
				r.Post("/dashboard/stripe/login-link", cfg.CreateStripeLoginLink)

			})

			// --- ADMIN ONLY (Sprint 4: raportări, carantină) ---
			r.Group(func(r chi.Router) {
				if cfg.AdminMiddleware != nil {
					r.Use(cfg.AdminMiddleware)
				}
			})
		})
	})

	return r
}
