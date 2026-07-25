package app

import (
	"context"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/auth"
	"pulse-api/internal/email"
	"pulse-api/internal/events"
	"pulse-api/internal/interactions"
	"pulse-api/internal/organizer"
	"pulse-api/internal/payments"
	"pulse-api/internal/router"
	"pulse-api/internal/tickets"
	"pulse-api/internal/users"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Application struct {
	Queries *db.Queries
	Pool    *pgxpool.Pool
}

// InitApplication configurează pool-ul de conexiuni, refolosit și local și în Lambda
func InitApplication() (*Application, error) {
	dbHost := os.Getenv("DB_HOST")
	if dbHost == "" {
		dbHost = "localhost"
	}

	dbPort := os.Getenv("DB_PORT")
	if dbPort == "" {
		dbPort = "5432"
	}

	dbUser := os.Getenv("DB_USER")
	if dbUser == "" {
		dbUser = "pulse_user"
	}

	dbPassword := os.Getenv("DB_PASSWORD")
	if dbPassword == "" {
		dbPassword = "Codelab1233q!"
	}

	dbName := os.Getenv("DB_NAME")
	if dbName == "" {
		dbName = "pulse_db"
	}

	dbSSLMode := os.Getenv("DB_SSLMODE")
	if dbSSLMode == "" {
		dbSSLMode = "disable"
	}

	query := url.Values{}
	query.Set("sslmode", dbSSLMode)

	dbURL := (&url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(dbUser, dbPassword),
		Host:     net.JoinHostPort(dbHost, dbPort),
		Path:     dbName,
		RawQuery: query.Encode(),
	}).String()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return nil, err
	}

	config.MaxConns = 15
	config.MinConns = 2
	config.MaxConnIdleTime = 15 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	return &Application{
		Queries: db.New(pool),
		Pool:    pool,
	}, nil
}

func (app *Application) BuildRouter() http.Handler {

	mailerService := email.NewMailer(
		os.Getenv("SMTP_HOST"),
		os.Getenv("SMTP_PORT"),
		os.Getenv("SMTP_FROM"),
		os.Getenv("SMTP_USERNAME"),
		os.Getenv("SMTP_PASSWORD"),
		os.Getenv("PUBLIC_API_URL"),
	)

	// 1. Instanțiem modulele din internal cu dependențele necesare
	authHandler := auth.NewHandler(app.Queries, mailerService)
	eventsHandler := events.NewHandler(app.Queries, app.Pool)
	interactionsHandler := interactions.NewHandler(app.Queries)
	usersHandler := users.NewHandler(app.Queries)
	authMiddleware := auth.AuthMiddleware
	scannerAuthMiddleware := auth.ScannerAuthMiddleware
	requireOrganizer := auth.RequireRole("organizer", "admin")
	requireAdmin := auth.RequireRole("admin")
	organizerHandler := organizer.NewHandler(app.Queries)
	ticketingHandler := tickets.NewHandler(app.Queries, app.Pool, os.Getenv("PUBLIC_APP_URL"))
	stripeCheckoutHandler := payments.NewCheckoutHandler(app.Queries, app.Pool, os.Getenv("STRIPE_SECRET_KEY"), os.Getenv("PUBLIC_APP_URL"), mailerService)
	stripeWebhookHandler := payments.NewWebhookHandler(os.Getenv("STRIPE_WEBHOOK_SECRET"), stripeCheckoutHandler)
	stripeConnectWebhookHandler := payments.NewConnectWebhookHandler(app.Queries, os.Getenv("STRIPE_CONNECT_WEBHOOK_SECRET"))
	stripeConnectHandler := payments.NewConnectHandler(
		app.Queries,
		os.Getenv("STRIPE_SECRET_KEY"),
		os.Getenv("PUBLIC_APP_URL"),
		os.Getenv("STRIPE_CONNECT_COUNTRY"),
	)

	// 2. Mapăm funcțiile în noua structură de configurare din router
	cfg := router.HandlersConfig{
		// Middleware-uri
		AuthMiddleware:         authMiddleware,
		OptionalAuthMiddleware: auth.OptionalAuthMiddleware,
		ScannerAuthMiddleware:  scannerAuthMiddleware,
		OrganizerMiddleware:    requireOrganizer,
		AdminMiddleware:        requireAdmin,

		// Auth
		Register: authHandler.HandleRegister,
		Activate: authHandler.HandleActivate,
		Login:    authHandler.Login,

		// Users
		GetMe:          usersHandler.HandleGetMe,
		UpdateMe:       usersHandler.HandleUpdateMe,
		CreateUser:     usersHandler.HandleCreateUser,
		GetUser:        usersHandler.HandleGetUser,
		GetUserTickets: ticketingHandler.HandleGetUserTickets,
		GetUserOrders:  ticketingHandler.HandleGetUserOrders,
		GetSavedEvents: eventsHandler.HandleListSavedEvents,

		// Events
		CreateEvent:             eventsHandler.HandleCreateEvent,
		ListEvents:              eventsHandler.HandleListEvents,
		GetEventByID:            eventsHandler.HandleGetEventByID,
		GetLiveEventsInArea:     eventsHandler.HandleGetLiveEventsInArea,
		DeleteEvent:             eventsHandler.HandleDeleteEvent,
		EditEvent:               eventsHandler.HandleEditEvent,
		GetEventWithStats:       eventsHandler.HandleGetEventWithStats,
		ListEventsWithStats:     eventsHandler.HandleListEventsWithStats,
		UploadEventBanner:       eventsHandler.HandleUploadEventBanner,
		GetEventBanner:          eventsHandler.HandleGetEventBanner,
		SaveEvent:               eventsHandler.HandleSaveEvent,
		RemoveSavedEvent:        eventsHandler.HandleRemoveSavedEvent,
		StripeWebhook:           stripeWebhookHandler.HandleStripeWebhook,
		StripeConnectWebhook:    stripeConnectWebhookHandler.HandleStripeConnectWebhook,
		CreateStripeAccountLink: stripeConnectHandler.HandleCreateAccountLink,
		GetStripeAccountStatus:  stripeConnectHandler.HandleGetAccountStatus,
		GetEventSocial:          interactionsHandler.HandleGetEventSocial,
		UpdateEventRsvp:         interactionsHandler.HandleUpdateEventRsvp,
		DeleteEventRsvp:         interactionsHandler.HandleDeleteEventRsvp,

		// Interactions / Checkins
		CreateCheckIn: interactionsHandler.HandleCreateCheckIn,
		DeleteCheckIn: interactionsHandler.HandleDeleteCheckIn,

		// Comments
		AddComment:  interactionsHandler.HandleAddComment,
		GetComments: interactionsHandler.HandleGetEventComments,

		// Friends
		GetFriends:             interactionsHandler.HandleGetFriends,
		SendFriendRequest:      interactionsHandler.HandleSendFriendRequest,
		RespondToFriendRequest: interactionsHandler.HandleRespondToFriendRequest,
		GetFriendRequests:      interactionsHandler.HandleGetFriendRequests,
		ConnectWithFriend:      interactionsHandler.HandleConnectWithFriend,
		SearchProfiles:         interactionsHandler.HandleSearchProfiles,
		GetPublicProfile:       interactionsHandler.HandleGetPublicProfile,
		FollowOrganizer:        interactionsHandler.HandleFollowOrganizer,
		UnfollowOrganizer:      interactionsHandler.HandleUnfollowOrganizer,
		GetEventAttendees:      interactionsHandler.HandleGetEventAttendees,
		GetSocialFeed:          interactionsHandler.HandleGetSocialFeed,

		// Organizer
		GetOrganizerProfile:    organizerHandler.HandleGetOrganizerProfile,
		CreateOrganizerProfile: organizerHandler.HandleCreateOrganizerProfile,

		// Tickets
		GetEventTicketTypes:   ticketingHandler.HandleGetTicketTypesForEvent,
		CreateTicketType:      ticketingHandler.HandleCreateTicketType,
		PurchaseTickets:       stripeCheckoutHandler.HandleCreateCheckout,
		ValidateTicket:        ticketingHandler.HandleValidateTicket,
		ListValidationEvents:  ticketingHandler.HandleListValidationEvents,
		ListValidationStaff:   ticketingHandler.HandleListValidationStaff,
		AddValidationStaff:    ticketingHandler.HandleAddValidationStaff,
		RemoveValidationStaff: ticketingHandler.HandleRemoveValidationStaff,
		CreateScannerAccess:   ticketingHandler.HandleCreateScannerAccess,
		ListScannerAccess:     ticketingHandler.HandleListScannerAccess,
		RevokeScannerAccess:   ticketingHandler.HandleRevokeScannerAccess,
		CreateScannerSession:  ticketingHandler.HandleCreateScannerSession,
		QuickValidateTicket:   ticketingHandler.HandleQuickValidateTicket,
	}

	// 3. Generăm routerul decuplat din internal/router folosind SetupRouter
	return router.SetupRouter(cfg)
}
