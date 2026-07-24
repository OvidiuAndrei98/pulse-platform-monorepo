import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3";

using TypeSpec.Http;
using TypeSpec.Rest;

@service
@server("https://api.pulse-app.local/v1", "Local development server")
namespace Pulse;

model ApiError {
  message: string;
}

model User {
  id: string;
  username: string;
  email: string;
  role: "user" | "organizer" | "admin";
  avatarUrl?: string;
  bio?: string;
  createdAt: utcDateTime;
}

model UserMinResponse {
  id: string;
  username: string;
  avatarUrl?: string;
}

// --- MODELELE UNIFICATE (ALINIATE CU GO / POSTGRESQL) ---

model TicketTypeResponse {
  id: string;
  name: string;
  priceRon: int32;
  capacity: int32;
  startSales: utcDateTime;
  endSales: utcDateTime;
  description?: string;

  // Vizibil DOAR pentru organizator în dashboard (MapFromDBListEventsWithStats / MapFromDBGetEventWithStats)
  ticketsSold?: int32;
}

model EventStatsResponse {
  totalCheckIns: int64;

  // Vizibil public când utilizatorul este autentificat (MapFromDBListEvents / MapFromDBGetEvent)
  userHasCheckedIn?: boolean;
  isFavorited?: boolean;

  // Vizibile DOAR pentru organizator în dashboard
  totalTicketsSold?: int64;

  totalRevenueRon?: int64;
  interestedCount?: int64;
  goingCount?: int64;
  ticketHolderCount?: int64;
}

model FriendEventActivityResponse {
  id: string;
  username: string;
  avatarUrl?: string;
  status: "interested" | "going" | "has_ticket";
}

model EventSocialResponse {
  interestedCount: int64;
  goingCount: int64;
  ticketHolderCount: int64;
  currentUserStatus: "none" | "interested" | "going" | "has_ticket";
  friends: FriendEventActivityResponse[];
}

model UpdateEventRsvpPayload {
  status: "interested" | "going";
}

model PublicProfileResponse {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  role: "user" | "organizer" | "admin";
  organizerName?: string;
  organizerVerified: boolean;
  relationship: "none" | "self" | "pending_sent" | "pending_received" | "friends";
  followsOrganizer: boolean;
  followerCount: int64;
}

model EventAttendeeResponse extends PublicProfileResponse {
  attendanceStatus: "going" | "has_ticket";
}

model SocialFeedItemResponse {
  activityType: "friend_ticket" | "friend_going" | "organizer_event";
  occurredAt: utcDateTime;
  actorId: string;
  actorUsername: string;
  actorAvatarUrl?: string;
  eventId: string;
  eventTitle: string;
  eventBannerUrl?: string;
  eventStartTime: utcDateTime;
  organizerName?: string;
}

model EventResponse {
  id: string;
  organizerId: string;
  title: string;
  description?: string;
  category: string;
  status: string;
  bannerUrl?: string;
  locationName: string;
  city: string;
  vibe: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
  isLive: boolean;
  createdAt: utcDateTime;

  // Răspunsul include întotdeauna colecțiile dedicate, controlate intern prin pointeri în Go
  ticketTypes: TicketTypeResponse[];

  stats: EventStatsResponse;
}

// --------------------------------------------------------

model CheckIn {
  id: string;
  eventId: string;
  userId: string;
  checkInTime: utcDateTime;
}

model Comment {
  id: string;
  content: string;
  createdAt: utcDateTime;
  username: string;
  avatarUrl?: string;
}

model OrganizerProfile {
  id: string;
  userId: string;
  companyName: string;
  cui: string;
  isVerified: boolean;
  verificationStatus: "pending" | "approved" | "rejected";
  caenCode?: string;
  stripeAccountId?: string;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  createdAt: utcDateTime;
}

model StripeAccountLinkResponse {
  url: string;
}

model UserTicketResponse {
  id: string;
  eventId: string;
  validationHash: string;
  isValidated: boolean;
  validatedAt?: utcDateTime;
  ticketTypeName: string;
  eventTitle: string;
  locationName: string;
  startTime: utcDateTime;
}

// --- REQUEST BODY PAYLOADS ---

model UserRegisterPayload {
  username: string;
  email: string;
  password: string;
  requestOrganizerRole?: boolean;
}

model UserLoginPayload {
  email: string;
  password: string;
}

model CreateEventPayload {
  title: string;
  description?: string;
  category: string;
  bannerUrl?: string;
  googlePlaceId: string;
  locationName: string;
  city: string;
  vibe: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
  status: "draft" | "published";
  ticketTypes?: CreateTicketTypePayload[];
}

model UpdateEventPayload {
  id: string;
  title: string;
  description?: string;
  category: string;
  bannerUrl?: string;
  googlePlaceId: string;
  locationName: string;
  city: string;
  vibe: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
  status: "draft" | "published";
  ticketTypes?: UpdateTicketTypePayload[];
}

model SubmitOrganizerProfilePayload {
  cui: string;
  companyName: string;
}

model CreateTicketTypePayload {
  name: string;
  priceRon: int32;
  capacity: int32;
  startSales: utcDateTime;
  endSales: utcDateTime;
  description?: string;
  eventId?: string;
}

model UpdateTicketTypePayload {
  id: string;
  name: string;
  priceRon: int32;
  capacity: int32;
  startSales: utcDateTime;
  endSales: utcDateTime;
  description?: string;
  eventId: string;
}

model CheckoutTicketItemPayload {
  ticketTypeId: string;
  quantity: int32;
}

model CreateCheckoutSessionPayload {
  email: string;
  items: CheckoutTicketItemPayload[];
}

model CheckoutSessionResponse {
  checkoutUrl: string;
  orderId: string;
}

// --- REQUESTS RESPONSE PAYLOADS ---

model TicketValidationResponse {
	status: "valid" | "already_validated";
	ticketId: string;
	ticketType: string;
	eventTitle: string;
	validatedAt: utcDateTime;
}

model ValidationEventResponse {
  id: string;
  title: string;
  startTime: utcDateTime;
  endTime: utcDateTime;
  status: string;
  locationName: string;
  canManage: boolean;
}

model ValidationStaffResponse {
  id: string;
  username: string;
  email: string;
  createdAt: utcDateTime;
}

model AddValidationStaffPayload {
  email: string;
}

model ScannerAccessResponse {
  id: string;
  label: string;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
  revokedAt?: utcDateTime;
  createdAt: utcDateTime;
}

model CreateScannerAccessPayload {
  label: string;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
}

model CreateScannerAccessResponse extends ScannerAccessResponse {
  url: string;
}

model CreateScannerSessionPayload {
  token: string;
}

model ScannerSessionResponse {
  sessionToken: string;
  label: string;
  eventTitle: string;
  locationName: string;
  expiresAt: utcDateTime;
}

// --- ENDPOINTS / RUTE ---

@route("/auth")
interface AuthOperations {
  @summary("Înregistrare utilizator nou")
  @post
  @route("/register")
  register(@body payload: UserRegisterPayload): {
    @statusCode statusCode: 201;
    @body user: User;
  };

  @summary("Autentificare utilizator")
  @post
  @route("/login")
  login(@body payload: UserLoginPayload): {
    @statusCode statusCode: 200;
    token: string;
  };
}

@route("/users")
interface UserOperations {
  @summary("Obține profilul utilizatorului curent")
  @get
  @route("/me")
  getMe(): User;

  @summary("Actualizează profilul curent")
  @put
  @route("/me")
  updateMe(
    @body profile: {
      username?: string;
      email?: string;
      role?: "user" | "organizer" | "admin";
      avatarUrl?: string;
      bio?: string;
    },
  ): User;

  @summary("Obține biletele utilizatorului curent")
  @get
  @route("/me/tickets")
  getUserTickets(): UserTicketResponse[];

  @summary("Obține evenimentele salvate ale utilizatorului curent")
  @get
  @route("/me/saved-events")
  getSavedEvents(): EventResponse[];
}

@route("/profiles")
interface ProfileOperations {
  @get
  @route("/search")
  search(@query q: string): PublicProfileResponse[];

  @get
  @route("/{id}")
  get(@path id: string): PublicProfileResponse;
}

@route("/events")
interface EventOperations {
  @summary("Listă completă de evenimente publice (suportă filtrare după categorie, isLive, geolocație pentru hartă și ID specific)")
  @get
  listEvents(
    @query category?: string,
    @query city?: string,
    @query vibe?: string,
    @query isLive?: boolean,
    @query latMin?: decimal,
    @query latMax?: decimal,
    @query lonMin?: decimal,
    @query lonMax?: decimal,
    @query page?: int32,
  ): EventResponse[];

  @summary("Salvează un eveniment în favorite")
  @post
  @route("/{id}/favorite")
  saveEvent(@path id: string): {
    @statusCode statusCode: 204;
  };

  @summary("Elimină un eveniment din favorite")
  @delete
  @route("/{id}/favorite")
  removeSavedEvent(@path id: string): {
    @statusCode statusCode: 204;
  };

  @summary("Obține intenția curentă, contoarele sociale și activitatea prietenilor")
  @get
  @route("/{id}/social")
  getSocial(@path id: string): EventSocialResponse;

  @summary("Setează statusul Interested sau Going")
  @put
  @route("/{id}/rsvp")
  setRsvp(@path id: string, @body payload: UpdateEventRsvpPayload): EventSocialResponse;

  @summary("Elimină statusul Interested sau Going")
  @delete
  @route("/{id}/rsvp")
  removeRsvp(@path id: string): EventSocialResponse;

  @get
  @route("/{id}/attendees")
  getAttendees(@path id: string): EventAttendeeResponse[];

  @summary("Detalii eveniment public după ID (folosește în spate clauza unificată ListEvents din DB)")
  @get
  @route("/{id}")
  getEventByID(@path id: string): EventResponse;

  @summary("Creeaza o sesiune Stripe Checkout pentru biletele selectate")
  @post
  @route("/{id}/tickets/purchase")
  createCheckoutSession(
    @path id: string,
    @body payload: CreateCheckoutSessionPayload,
  ): {
    @statusCode statusCode: 201;
    @body checkout: CheckoutSessionResponse;
  };

  @summary("Ștergere eveniment")
  @delete
  @route("/{id}")
  deleteEvent(@path id: string): {
    @statusCode statusCode: 204;
  };

  @summary("Check-in la un eveniment live")
  @post
  @route("/{id}/check-in")
  checkIn(@path id: string): {
    @statusCode statusCode: 200;
    success: boolean;
  };

  @summary("Adaugă un comentariu")
  @post
  @route("/{id}/comments")
  addComment(
    @path id: string,
    @body content: {
      content: string;
    },
  ): Comment;

  @summary("Obține comentariile unui eveniment")
  @get
  @route("/{id}/comments")
  getComments(@path id: string, @query page?: int32): Comment[];

  @summary("Obține lista de prieteni acceptați care merg la acest eveniment")
  @get
  @route("/{id}/friends")
  getFriendsGoingToEvent(@path id: string): UserMinResponse[];
}

@route("/friends")
interface FriendOperations {
  @summary("Lista de prieteni acceptați")
  @get
  listFriends(): PublicProfileResponse[];

  @summary("Trimite cerere de prietenie")
  @post
  @route("/request/{userId}")
  sendRequest(@path userId: string): {
    @statusCode statusCode: 201;
  };

  @summary("Acceptă sau refuză o cerere de prietenie")
  @put
  @route("/request/{userId}")
  respondToRequest(
    @path userId: string,
    @body action: {
      status: "accepted" | "declined";
    },
  ): {
    @statusCode statusCode: 200;
  };

  @post
  @route("/connect/{userId}")
  connect(@path userId: string): {
    @statusCode statusCode: 200;
    relationship: "friends";
  };

  @summary("Obține cererile de prietenie primite")
  @get
  @route("/requests")
  getFriendRequests(): PublicProfileResponse[];
}

@route("/organizers")
interface OrganizerSocialOperations {
  @post
  @route("/{userId}/follow")
  follow(@path userId: string): {
    followsOrganizer: boolean;
  };

  @delete
  @route("/{userId}/follow")
  unfollow(@path userId: string): {
    followsOrganizer: boolean;
  };
}

@route("/feed")
interface FeedOperations {
  @get
  list(): SocialFeedItemResponse[];
}

@route("/dashboard")
interface DashboardOperations {
  @post
  @route("/organizer/profile")
  @summary("Trimite datele pentru un profil nou sau existent de organizator (Validare ANAF)")
  submitProfile(@body payload: SubmitOrganizerProfilePayload): OrganizerProfile;

  @get
  @route("/organizer/profile/{id}")
  @summary("Preia profilul unui organizator după ID-ul său")
  getProfile(@path id: string): OrganizerProfile;

  @summary("Creeaza sau reia onboarding-ul Stripe Connect pentru organizatorul curent")
  @post
  @route("/stripe/account-link")
  createStripeAccountLink(): StripeAccountLinkResponse;

  @summary("Actualizeaza starea Stripe Connect a organizatorului curent")
  @get
  @route("/stripe/status")
  getStripeAccountStatus(): OrganizerProfile;

  @summary("Creare eveniment nou (doar Organizatori/Admini)")
  @post
  @route("/events")
  createEvent(@body event: CreateEventPayload): {
    @statusCode statusCode: 201;
    @body created: EventResponse;
  };

  @get
  @route("/events")
  @summary("Obține lista de evenimente ale organizatorului curent (cu statistici agregate complete)")
  getOrganizerEvents(): EventResponse[];

  @post
  @route("/events/{id}")
  @summary("Editează un eveniment existent (doar Organizatori/Admini)")
  editEvent(@path id: string, @body event: CreateEventPayload): EventResponse;

  @get
  @route("/events/{id}")
  @summary("Obține detaliile administrative complete ale unui singur eveniment din dashboard (GetEventWithStats)")
  getEventWithStats(@path id: string): EventResponse;

  @delete
  @route("/events/{id}")
  @summary("Șterge un eveniment (doar Organizatori/Admini)")
  deleteEvent(@path id: string): {
    @statusCode statusCode: 204;
  };

  @summary("Creare tip de bilet pentru un eveniment")
  @post
  @route("/events/{id}/ticket-types")
  createTicketType(
    @path id: string,
    @body ticketType: CreateTicketTypePayload,
  ): {
    @statusCode statusCode: 201;
    @body response: {
      status: "success";
    };
  };

}

@route("/dashboard/ticket-validation")
interface TicketValidationOperations {
  @get
  @route("/events")
  listValidationEvents(): ValidationEventResponse[];

  @get
  @route("/events/{id}/staff")
  listValidationStaff(@path id: string): ValidationStaffResponse[];

  @post
  @route("/events/{id}/staff")
  addValidationStaff(@path id: string, @body payload: AddValidationStaffPayload): {
    @statusCode statusCode: 204;
  };

  @delete
  @route("/events/{id}/staff/{userId}")
  removeValidationStaff(@path id: string, @path userId: string): {
    @statusCode statusCode: 204;
  };

  @get
  @route("/events/{id}/quick-access")
  listScannerAccess(@path id: string): ScannerAccessResponse[];

  @post
  @route("/events/{id}/quick-access")
  createScannerAccess(
    @path id: string,
    @body payload: CreateScannerAccessPayload,
  ): {
    @statusCode statusCode: 201;
    @body response: CreateScannerAccessResponse;
  };

  @delete
  @route("/events/{id}/quick-access/{accessId}")
  revokeScannerAccess(@path id: string, @path accessId: string): {
    @statusCode statusCode: 204;
  };

  @post
  @route("/events/{id}/tickets/validate")
  validateTicket(
    @path id: string,
    @body ticket: {
      validationHash: string;
    },
  ):
    | {
        @statusCode statusCode: 200;
        @body response: TicketValidationResponse;
      }
    | {
        @statusCode statusCode: 404;
        @body response: ApiError;
      }
    | {
        @statusCode statusCode: 400;
        @body response: ApiError;
      }
    | {
        @statusCode statusCode: 500;
        @body response: ApiError;
      };
}

@route("/ticket-validation/quick-access")
interface QuickScannerOperations {
  @post
  @route("/session")
  createScannerSession(@body payload: CreateScannerSessionPayload): ScannerSessionResponse;

  @post
  @route("/validate")
  validateTicket(
    @body ticket: {
      validationHash: string;
    },
  ):
    | {
        @statusCode statusCode: 200;
        @body response: TicketValidationResponse;
      }
    | {
        @statusCode statusCode: 404;
        @body response: ApiError;
      }
    | {
        @statusCode statusCode: 400;
        @body response: ApiError;
      }
    | {
        @statusCode statusCode: 500;
        @body response: ApiError;
      };
}
