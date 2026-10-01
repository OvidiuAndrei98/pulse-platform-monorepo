package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	db "pulse-api/db/generated"
	"pulse-api/internal/abuse"
	"pulse-api/internal/auth"
	"pulse-api/internal/email"
	"pulse-api/internal/events"
	"pulse-api/internal/interactions"
	"pulse-api/internal/invoicing"
	"pulse-api/internal/notifications"
	"pulse-api/internal/organizer"
	"pulse-api/internal/payments"
	"pulse-api/internal/promotions"
	"pulse-api/internal/router"
	"pulse-api/internal/safetygroups"
	"pulse-api/internal/spotify"
	"pulse-api/internal/tickets"
	"pulse-api/internal/users"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Application struct {
	Queries   *db.Queries
	Pool      *pgxpool.Pool
	Invoicing *invoicing.Service
	Refunds   *payments.CheckoutHandler
	Abuse     *abuse.Protection
}

type databaseSettings struct {
	host        string
	port        string
	user        string
	password    string
	name        string
	sslMode     string
	sslRootCert string
}

func loadDatabaseSettings() (databaseSettings, error) {
	settings := databaseSettings{
		host:     strings.TrimSpace(os.Getenv("DB_HOST")),
		port:     strings.TrimSpace(os.Getenv("DB_PORT")),
		user:     strings.TrimSpace(os.Getenv("DB_USER")),
		password: os.Getenv("DB_PASSWORD"),
		name:     strings.TrimSpace(os.Getenv("DB_NAME")),
		sslMode:  strings.ToLower(strings.TrimSpace(os.Getenv("DB_SSLMODE"))),
	}
	if settings.host == "" {
		settings.host = "localhost"
	} else if unwrappedHost := strings.Trim(settings.host, "[]"); net.ParseIP(unwrappedHost) != nil {
		// net.JoinHostPort adds IPv6 brackets itself.
		settings.host = unwrappedHost
	}
	if settings.port == "" {
		settings.port = "5432"
	}
	if settings.user == "" {
		settings.user = "pulse_user"
	}
	if settings.name == "" {
		settings.name = "pulse_db"
	}

	lowerPassword := strings.ToLower(settings.password)
	if len(settings.password) < 16 || strings.TrimSpace(settings.password) == "" ||
		strings.Contains(lowerPassword, "changeme") || strings.Contains(lowerPassword, "change-me") ||
		strings.Contains(lowerPassword, "dbpassword") || strings.Contains(lowerPassword, "replace-me") {
		return databaseSettings{}, errors.New("DB_PASSWORD must be explicitly configured with at least 16 characters and must not be a placeholder")
	}
	port, err := strconv.Atoi(settings.port)
	if err != nil || port < 1 || port > 65535 {
		return databaseSettings{}, errors.New("DB_PORT must be a valid TCP port")
	}

	localHost := isLoopbackDatabaseHost(settings.host)
	if settings.sslMode == "" {
		if !localHost {
			return databaseSettings{}, errors.New("DB_SSLMODE must be verify-full for a non-loopback database host")
		}
		settings.sslMode = "disable"
	}
	if settings.sslMode != "disable" && settings.sslMode != "verify-full" {
		return databaseSettings{}, errors.New("DB_SSLMODE must be disable for local development or verify-full with certificate validation")
	}
	if !localHost && settings.sslMode != "verify-full" {
		return databaseSettings{}, errors.New("non-loopback database connections require DB_SSLMODE=verify-full")
	}
	if settings.sslMode == "verify-full" {
		settings.sslRootCert = strings.TrimSpace(os.Getenv("DB_SSLROOTCERT"))
		if settings.sslRootCert == "" {
			return databaseSettings{}, errors.New("DB_SSLROOTCERT is required when DB_SSLMODE=verify-full")
		}
		certificate, err := os.Stat(settings.sslRootCert)
		if err != nil || !certificate.Mode().IsRegular() {
			return databaseSettings{}, errors.New("DB_SSLROOTCERT must reference a readable certificate file")
		}
	}
	return settings, nil
}

func isLoopbackDatabaseHost(host string) bool {
	if strings.EqualFold(strings.TrimSpace(host), "localhost") {
		return true
	}
	ip := net.ParseIP(strings.Trim(host, "[]"))
	return ip != nil && ip.IsLoopback()
}

func databaseConnectionURL(settings databaseSettings) string {
	query := url.Values{}
	query.Set("sslmode", settings.sslMode)
	if settings.sslRootCert != "" {
		query.Set("sslrootcert", settings.sslRootCert)
	}
	return (&url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(settings.user, settings.password),
		Host:     net.JoinHostPort(settings.host, settings.port),
		Path:     settings.name,
		RawQuery: query.Encode(),
	}).String()
}

// InitApplication configurează pool-ul de conexiuni, refolosit și local și în Lambda
func InitApplication() (*Application, error) {
	jwtSigningKey, err := auth.JWTSigningKey()
	if err != nil {
		return nil, err
	}
	settings, err := loadDatabaseSettings()
	if err != nil {
		return nil, fmt.Errorf("invalid database configuration: %w", err)
	}
	dbURL := databaseConnectionURL(settings)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return nil, errors.New("database connection configuration could not be parsed")
	}

	config.MaxConns = 15
	config.MinConns = 2
	config.MaxConnIdleTime = 15 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, errors.New("database connection pool could not be created")
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, errors.New("database connection health check failed")
	}

	queries := db.New(pool)
	abuseProtection, err := abuse.NewProtection(pool, jwtSigningKey, os.Getenv("TRUSTED_PROXY_CIDRS"))
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("invalid abuse protection configuration: %w", err)
	}
	return &Application{
		Queries:   queries,
		Pool:      pool,
		Invoicing: invoicing.NewService(queries, pool, os.Getenv("INVOICING_ENCRYPTION_KEY")),
		Abuse:     abuseProtection,
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
		os.Getenv("PUBLIC_APP_URL"),
		os.Getenv("SMTP_RECIPIENT_OVERRIDE"),
	)

	// 1. Instanțiem modulele din internal cu dependențele necesare
	authHandler := auth.NewHandler(app.Queries, app.Pool, mailerService, app.Abuse, os.Getenv("PUBLIC_APP_URL"))
	authHandler.ConfigureGoogleOAuth(auth.GoogleOAuthConfig{
		ClientID:        os.Getenv("GOOGLE_OAUTH_CLIENT_ID"),
		ClientSecret:    os.Getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
		PublicAPIURL:    os.Getenv("PUBLIC_API_URL"),
		PublicAppURL:    os.Getenv("PUBLIC_APP_URL"),
		MobileAppScheme: os.Getenv("MOBILE_APP_SCHEME"),
	})
	eventsHandler := events.NewHandler(app.Queries, app.Pool)
	interactionsHandler := interactions.NewHandler(app.Queries)
	usersHandler := users.NewHandler(app.Queries, app.Pool)
	notificationsHandler := notifications.NewHandler(app.Queries)
	safetyGroupsHandler := safetygroups.NewHandler(app.Pool, app.Abuse)
	authMiddleware := auth.AuthMiddleware
	scannerAuthMiddleware := auth.ScannerAuthMiddleware
	requireOrganizer := auth.RequireRole("organizer", "admin")
	requireAdmin := auth.RequireRole("admin")
	organizerHandler := organizer.NewHandler(app.Queries)
	ticketingHandler := tickets.NewHandler(app.Queries, app.Pool, os.Getenv("PUBLIC_APP_URL"))
	stripeCheckoutHandler := payments.NewCheckoutHandler(app.Queries, app.Pool, os.Getenv("STRIPE_SECRET_KEY"), os.Getenv("PUBLIC_APP_URL"), mailerService, app.Invoicing, app.Abuse)
	app.Refunds = stripeCheckoutHandler
	promotionHandler := promotions.NewHandler(app.Queries, app.Pool, os.Getenv("STRIPE_SECRET_KEY"), os.Getenv("PUBLIC_APP_URL"), app.Invoicing)
	stripeWebhookHandler := payments.NewWebhookHandler(os.Getenv("STRIPE_WEBHOOK_SECRET"), stripeCheckoutHandler, promotionHandler)
	stripeConnectWebhookHandler := payments.NewConnectWebhookHandler(app.Queries, os.Getenv("STRIPE_CONNECT_WEBHOOK_SECRET"), stripeCheckoutHandler)
	stripeConnectHandler := payments.NewConnectHandler(
		app.Queries,
		os.Getenv("STRIPE_SECRET_KEY"),
		os.Getenv("PUBLIC_APP_URL"),
		os.Getenv("STRIPE_CONNECT_COUNTRY"),
	)
	spotifyHandler := spotify.NewHandler(
		os.Getenv("SPOTIFY_CLIENT_ID"),
		os.Getenv("SPOTIFY_CLIENT_SECRET"),
	)

	// 2. Mapăm funcțiile în noua structură de configurare din router
	cfg := router.HandlersConfig{
		HealthCheck: app.Pool.Ping,

		// Middleware-uri
		AuthMiddleware:         authMiddleware,
		OptionalAuthMiddleware: auth.OptionalAuthMiddleware,
		ScannerAuthMiddleware:  scannerAuthMiddleware,
		OrganizerMiddleware:    requireOrganizer,
		AdminMiddleware:        requireAdmin,
		RateLimit:              app.Abuse.Middleware,

		// Auth
		Register:             authHandler.HandleRegister,
		Activate:             authHandler.HandleActivate,
		Login:                authHandler.Login,
		GoogleLogin:          authHandler.HandleGoogleLogin,
		GoogleCallback:       authHandler.HandleGoogleCallback,
		SearchSpotifyArtists: spotifyHandler.Search,
		ForgotPassword:       authHandler.ForgotPassword,
		ResetPassword:        authHandler.ResetPassword,

		// Users
		GetMe:                       usersHandler.HandleGetMe,
		UpdateMe:                    usersHandler.HandleUpdateMe,
		DeleteMe:                    usersHandler.HandleDeleteMe,
		UploadUserAvatar:            usersHandler.HandleUploadAvatar,
		GetUserTickets:              ticketingHandler.HandleGetUserTickets,
		GetUserOrders:               ticketingHandler.HandleGetUserOrders,
		GetSavedEvents:              eventsHandler.HandleListSavedEvents,
		ListNotifications:           notificationsHandler.HandleList,
		MarkAllNotificationsRead:    notificationsHandler.HandleMarkAllRead,
		MarkNotificationRead:        notificationsHandler.HandleMarkRead,
		ListHiddenCategories:        usersHandler.HandleListHiddenCategories,
		HideEventCategory:           usersHandler.HandleHideCategory,
		ShowEventCategory:           usersHandler.HandleShowCategory,
		GetBillingDetails:           usersHandler.HandleGetBillingDetails,
		SaveBillingDetails:          usersHandler.HandleSaveBillingDetails,
		DeleteBillingDetails:        usersHandler.HandleDeleteBillingDetails,
		GetEventSafetyGroup:         safetyGroupsHandler.HandleGet,
		CreateEventSafetyGroup:      safetyGroupsHandler.HandleCreate,
		InviteEventSafetyGroup:      safetyGroupsHandler.HandleInvite,
		RespondEventSafetyGroup:     safetyGroupsHandler.HandleRespond,
		SendSafetyGroupMessage:      safetyGroupsHandler.HandleMessage,
		SendSafetyGroupHelp:         safetyGroupsHandler.HandleHelp,
		ResolveSafetyGroupHelp:      safetyGroupsHandler.HandleHelpResolved,
		ListOrganizerVerifications:  organizerHandler.HandleAdminListOrganizerVerifications,
		ReviewOrganizerVerification: organizerHandler.HandleAdminReviewOrganizerVerification,

		// Events
		CreateEvent:                    eventsHandler.HandleCreateEvent,
		ListEvents:                     eventsHandler.HandleListEvents,
		GetEventByID:                   eventsHandler.HandleGetEventByID,
		GetLiveEventsInArea:            eventsHandler.HandleGetLiveEventsInArea,
		DeleteEvent:                    eventsHandler.HandleDeleteEvent,
		EditEvent:                      eventsHandler.HandleEditEvent,
		GetEventWithStats:              eventsHandler.HandleGetEventWithStats,
		ListEventsWithStats:            eventsHandler.HandleListEventsWithStats,
		UploadEventBanner:              eventsHandler.HandleUploadEventBanner,
		UploadOrganizerUpdateImage:     eventsHandler.HandleUploadOrganizerUpdateImage,
		GetEventBanner:                 eventsHandler.HandleGetEventBanner,
		GetEventUpdates:                eventsHandler.HandleGetEventUpdates,
		GetOrganizerUpdates:            eventsHandler.HandleGetOrganizerUpdates,
		CreateEventUpdate:              eventsHandler.HandleCreateEventUpdate,
		DeleteEventUpdate:              eventsHandler.HandleDeleteEventUpdate,
		SaveEvent:                      eventsHandler.HandleSaveEvent,
		RemoveSavedEvent:               eventsHandler.HandleRemoveSavedEvent,
		StripeWebhook:                  stripeWebhookHandler.HandleStripeWebhook,
		StripeConnectWebhook:           stripeConnectWebhookHandler.HandleStripeConnectWebhook,
		ReconcileCheckout:              stripeCheckoutHandler.HandleReconcileCheckout,
		CreateStripeAccountLink:        stripeConnectHandler.HandleCreateAccountLink,
		GetStripeAccountStatus:         stripeConnectHandler.HandleGetAccountStatus,
		CreateStripeLoginLink:          stripeConnectHandler.HandleCreateDashboardLoginLink,
		DisconnectStripeAccount:        stripeConnectHandler.HandleDisconnectAccount,
		GetEventSocial:                 interactionsHandler.HandleGetEventSocial,
		UpdateEventRsvp:                interactionsHandler.HandleUpdateEventRsvp,
		DeleteEventRsvp:                interactionsHandler.HandleDeleteEventRsvp,
		ListPromoCodes:                 eventsHandler.HandleListPromoCodes,
		CreatePromoCode:                eventsHandler.HandleCreatePromoCode,
		DeactivatePromoCode:            eventsHandler.HandleDeactivatePromoCode,
		ValidatePromoCode:              stripeCheckoutHandler.HandleValidatePromoCode,
		ListPromotionPlans:             promotionHandler.HandleListPlans,
		GetPromotionAvailability:       promotionHandler.HandleAvailability,
		CreatePromotionCheckout:        promotionHandler.HandleCreateCheckout,
		ListPromotionCampaigns:         promotionHandler.HandleListCampaigns,
		ListActivePromotions:           promotionHandler.HandleListActive,
		TrackPromotionMetric:           promotionHandler.HandleTrackMetric,
		CreateEventCancellationRequest: stripeCheckoutHandler.HandleCreateEventCancellationRequest,
		GetEventCancellationRequest:    stripeCheckoutHandler.HandleGetEventCancellationRequest,
		ListEventCancellationRequests:  stripeCheckoutHandler.HandleAdminListEventCancellationRequests,
		ApproveEventCancellation:       stripeCheckoutHandler.HandleAdminApproveEventCancellation,
		RejectEventCancellation:        stripeCheckoutHandler.HandleAdminRejectEventCancellation,
		RetryEventCancellation:         stripeCheckoutHandler.HandleAdminRetryEventCancellation,
		ListOrganizerRefundAttention:   stripeCheckoutHandler.HandleListOrganizerRefundsRequiringAttention,
		ReconcileOrganizerRefund:       stripeCheckoutHandler.HandleReconcileOrganizerRefundAttention,
		ListAdminRefundAttention:       stripeCheckoutHandler.HandleAdminListRefundsRequiringAttention,
		ReconcileAdminRefund:           stripeCheckoutHandler.HandleAdminReconcileRefundAttention,
		ListPromotionInvoiceAttention:  promotionHandler.HandleAdminInvoiceAttention,

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
		RemoveFriend:           interactionsHandler.HandleRemoveFriend,
		GetFriendRequests:      interactionsHandler.HandleGetFriendRequests,
		ConnectWithFriend:      interactionsHandler.HandleConnectWithFriend,
		SearchProfiles:         interactionsHandler.HandleSearchProfiles,
		GetPublicProfile:       interactionsHandler.HandleGetPublicProfile,
		FollowOrganizer:        interactionsHandler.HandleFollowOrganizer,
		UnfollowOrganizer:      interactionsHandler.HandleUnfollowOrganizer,
		GetEventAttendees:      interactionsHandler.HandleGetEventAttendees,
		GetSocialFeed:          interactionsHandler.HandleGetSocialFeed,

		// Organizer
		GetOrganizerProfile:         organizerHandler.HandleGetOrganizerProfile,
		CreateOrganizerProfile:      organizerHandler.HandleCreateOrganizerProfile,
		AcceptOrganizerAgreement:    organizerHandler.HandleAcceptOrganizerAgreement,
		GetOrganizerFinance:         organizerHandler.HandleGetOrganizerFinance,
		ListPlatformInvoices:        app.Invoicing.HandleListPlatformCommissionInvoices,
		GetInvoicingSettings:        app.Invoicing.HandleGetSettings,
		GetInvoicingProviderOptions: app.Invoicing.HandleGetProviderOptions,
		SaveInvoicingSettings:       app.Invoicing.HandleSaveSettings,
		DeleteInvoicingSettings:     app.Invoicing.HandleDeleteSettings,
		ListBillingInvoices:         app.Invoicing.HandleListInvoices,
		RetryBillingInvoice:         app.Invoicing.HandleRetryInvoice,

		// Tickets
		GetEventTicketTypes:   ticketingHandler.HandleGetTicketTypesForEvent,
		CreateTicketType:      ticketingHandler.HandleCreateTicketType,
		PurchaseTickets:       stripeCheckoutHandler.HandleCreateCheckout,
		BookFreeTicket:        stripeCheckoutHandler.HandleBookFreeTicket,
		ValidateTicket:        ticketingHandler.HandleValidateTicket,
		ListValidationEvents:  ticketingHandler.HandleListValidationEvents,
		ListMyValidationScans: ticketingHandler.HandleListMyValidationScans,
		ListValidationStaff:   ticketingHandler.HandleListValidationStaff,
		AddValidationStaff:    ticketingHandler.HandleAddValidationStaff,
		RemoveValidationStaff: ticketingHandler.HandleRemoveValidationStaff,
		CreateScannerAccess:   ticketingHandler.HandleCreateScannerAccess,
		ListScannerAccess:     ticketingHandler.HandleListScannerAccess,
		RevokeScannerAccess:   ticketingHandler.HandleRevokeScannerAccess,
		CreateScannerSession:  ticketingHandler.HandleCreateScannerSession,
		QuickValidateTicket:   ticketingHandler.HandleQuickValidateTicket,
		CreateInvitation:      ticketingHandler.HandleCreateInvitation,
		ListInvitations:       ticketingHandler.HandleListInvitations,
		RevokeInvitation:      ticketingHandler.HandleRevokeInvitation,
		DeleteInvitation:      ticketingHandler.HandleDeleteInvitation,
		CreateOfflineSnapshot: ticketingHandler.HandleCreateOfflineSnapshot,
		SyncOfflineScans:      ticketingHandler.HandleSyncOfflineScans,
	}

	// 3. Generăm routerul decuplat din internal/router folosind SetupRouter
	return router.SetupRouter(cfg)
}

func (app *Application) StartEventExpiryWorker(ctx context.Context) {
	events.NewHandler(app.Queries, app.Pool).StartEventExpiryWorker(ctx)
}

func (app *Application) StartPromotionReservationExpiryWorker(ctx context.Context) {
	promotions.NewHandler(app.Queries, app.Pool, os.Getenv("STRIPE_SECRET_KEY"), os.Getenv("PUBLIC_APP_URL"), app.Invoicing).StartReservationExpiryWorker(ctx)
}

func (app *Application) StartInvoicingWorker(ctx context.Context) {
	if app.Invoicing != nil {
		app.Invoicing.StartWorker(ctx)
	}
}

func (app *Application) StartRefundWorker(ctx context.Context) {
	if app.Refunds != nil {
		app.Refunds.StartRefundWorker(ctx)
	}
}

func (app *Application) StartCheckoutReconciliationWorker(ctx context.Context) {
	if app.Refunds != nil {
		app.Refunds.StartCheckoutReconciliationWorker(ctx)
	}
}

func (app *Application) StartAbuseProtectionWorker(ctx context.Context) {
	if app.Abuse != nil {
		app.Abuse.StartCleanupWorker(ctx)
	}
}

func (app *Application) StartSafetyGroupCleanupWorker(ctx context.Context) {
	safetygroups.NewHandler(app.Pool, app.Abuse).StartCleanupWorker(ctx)
}

func (app *Application) StartUserMediaDeletionWorker(ctx context.Context) {
	users.NewHandler(app.Queries, app.Pool).StartMediaDeletionWorker(ctx)
}
