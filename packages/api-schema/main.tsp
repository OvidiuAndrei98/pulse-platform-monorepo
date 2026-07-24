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
  createdAt: utcDateTime;
}

model Ticket {
  id: string;
  eventId: string;
  name: string;
  priceRon: int32;
  capacity: int32;
  ticketsSold: int32;
  startSales: utcDateTime;
  endSales: utcDateTime;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
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

// --- REQUESTS RESPONSE PAYLOADS ---

model TicketValidationResponse {
  status: "valid" | "already_validated";
  ticketId: string;
  ticketType: string;
  eventTitle: string;
  validatedAt: utcDateTime;
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
  getUserTickets(): Ticket[];

  @summary("Obține evenimentele salvate ale utilizatorului curent")
  @get
  @route("/me/saved-events")
  getSavedEvents(): EventResponse[];
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

  @summary("Detalii eveniment public după ID (folosește în spate clauza unificată ListEvents din DB)")
  @get
  @route("/{id}")
  getEventByID(@path id: string): EventResponse;

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
  listFriends(): User[];

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

  @summary("Obține cererile de prietenie primite")
  @get
  @route("/requests")
  getFriendRequests(): User[];
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

  @summary("Validare bilet la un eveniment")
  @post
  @route("/events/{id}/tickets/validate")
  validateTicket(
    @path id: string,
    @body ticket: {
      ValidationHash: string;
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
