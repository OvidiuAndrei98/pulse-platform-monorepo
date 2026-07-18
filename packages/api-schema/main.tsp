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

model Event {
  id: string;
  organizerId: string;
  title: string;
  description?: string;
  category: string;
  bannerUrl?: string;
  googlePlaceId: string;
  locationName: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
  isLive: boolean;
  createdAt: utcDateTime;
}

model EventWithStats {
  id: string;
  organizerId: string;
  title: string;
  description?: string;
  category: string;
  bannerUrl?: string;
  googlePlaceId: string;
  locationName: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
  isLive: boolean;
  createdAt: utcDateTime;
  checkInCount: int32;
  commentCount: int32;
}

model CheckIn {
  id: string;
  eventId: string;
  userId: string;
  checkInTime: utcDateTime;
}

model Comment {
  id: string;
  eventId: string;
  userId: string;
  content: string;
  createdAt: utcDateTime;
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

model TicketType {
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
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
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
}

@route("/events")
interface EventOperations {
  @summary("Obține evenimentele active pentru Live Map dintr-o zonă geografică")
  @get
  @route("/map")
  getMapEvents(
    @query latMin: decimal,
    @query latMax: decimal,
    @query lonMin: decimal,
    @query lonMax: decimal,
  ): Event[];

  @summary("Listă completă de evenimente")
  @get
  listEvents(@query category?: string, @query page?: int32): Event[];

  @summary("Creare eveniment nou (doar Organizatori/Admini)")
  @post
  createEvent(@body event: CreateEventPayload): {
    @statusCode statusCode: 201;
    @body created: Event;
  };

  @summary("Detalii eveniment după ID")
  @get
  @route("/{id}")
  getEventWithStats(@path id: string): EventWithStats;

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
  getComments(@path id: string): Comment[];

  @summary("Obține tipurile de bilete pentru un eveniment")
  @get
  @route("/{id}/ticket-types")
  getTicketTypes(@path id: string): TicketType[];
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

  @post
  @route("/events/{id}")
  @summary("Editează un eveniment existent (doar Organizatori/Admini)")
  editEvent(@path id: string, @body event: CreateEventPayload): Event;
  @get
  @route("/events/{id}")
  @summary("Obține detalii despre un eveniment")
  getEvent(@path id: string): EventWithStats;

  @summary("Creare tip de bilet pentru un eveniment")
  @post
  @route("/events/{id}/ticket-types")
  createTicketType(@path id: string, @body ticketType: TicketType): {
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
