import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3"; 

using TypeSpec.Http;
using TypeSpec.Rest;

@service
@server("https://api.pulse-app.local/v1", "Local development server")
namespace Pulse;


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
  locationName: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
  isLive: boolean;
  createdAt: utcDateTime;
}

model Comment {
  id: string;
  eventId: string;
  userId: string;
  content: string;
  createdAt: utcDateTime;
}

// --- REQUEST BODY PAYLOADS ---

model UserRegisterPayload {
  username: string;
  email: string;
  passwordHash: string;
}

model UserLoginPayload {
  email: string;
  passwordHash: string;
}

model CreateEventPayload {
  title: string;
  description?: string;
  category: string;
  bannerUrl?: string;
  locationName: string;
  latitude: decimal;
  longitude: decimal;
  startTime: utcDateTime;
  endTime: utcDateTime;
}

// --- ENDPOINTS / RUTE ---

@route("/auth")
interface AuthOperations {
  @summary("Înregistrare utilizator nou")
  @post @route("/register")
  register(@body payload: UserRegisterPayload): { @statusCode statusCode: 201, @body user: User };

  @summary("Autentificare utilizator")
  @post @route("/login")
  login(@body payload: UserLoginPayload): { @statusCode statusCode: 200, token: string };
}

@route("/users")
interface UserOperations {
  @summary("Obține profilul utilizatorului curent")
  @get @route("/me")
  getMe(): User;

  @summary("Actualizează profilul curent")
  @put @route("/me")
  updateMe(@body profile: {
    username?: string;
    email?: string;
    role?: "user" | "organizer" | "admin";
    avatarUrl?: string;
    bio?: string;
  }): User;
}

@route("/events")
interface EventOperations {
  @summary("Obține evenimentele active pentru Live Map dintr-o zonă geografică")
  @get @route("/map")
  getMapEvents(
    @query latMin: decimal,
    @query latMax: decimal,
    @query lonMin: decimal,
    @query lonMax: decimal
  ): Event[];

  @summary("Listă completă de evenimente")
  @get listEvents(@query category?: string, @query page?: int32): Event[];

  @summary("Creare eveniment nou (doar Organizatori/Admini)")
  @post createEvent(@body event: CreateEventPayload): { @statusCode statusCode: 201, @body created: Event };

  @summary("Detalii eveniment după ID")
  @get @route("/{id}")
  getEvent(@path id: string): Event;

  @summary("Ștergere eveniment")
  @delete @route("/{id}")
  deleteEvent(@path id: string): { @statusCode statusCode: 204 };

  @summary("Check-in la un eveniment live")
  @post @route("/{id}/check-in")
  checkIn(@path id: string): { @statusCode statusCode: 200, success: boolean };

  @summary("Adaugă un comentariu")
  @post @route("/{id}/comments")
  addComment(@path id: string, @body content: { content: string }): Comment;
}

@route("/friends")
interface FriendOperations {
  @summary("Lista de prieteni acceptați")
  @get listFriends(): User[];

  @summary("Trimite cerere de prietenie")
  @post @route("/request/{userId}")
  sendRequest(@path userId: string): { @statusCode statusCode: 201 };

  @summary("Acceptă sau refuză o cerere de prietenie")
  @put @route("/request/{userId}")
  respondToRequest(@path userId: string, @body action: { status: "accepted" | "declined" }): { @statusCode statusCode: 200 };
}