import "@typespec/http";
using TypeSpec.Http;
namespace Pulse;
alias OutingAnswer = "yes" | "maybe" | "no";
alias OutingArrival = "not_set" | "leaving_soon" | "on_way" | "arrived" | "not_coming";
model OutingReaction { userId: string; answer: OutingAnswer; }
model OutingDateOption { date: string; responses: OutingReaction[]; }
model OutingPreviousEvent { eventId: string; title: string; changedAt: utcDateTime; }
model OutingMember { userId: string; username: string; avatarUrl?: string; status: "pending" | "accepted" | "declined"; voteEventId?: string; hasTicket?: boolean; hasPreviousTicket?: boolean; arrivalStatus?: OutingArrival; arrivalUpdatedAt?: utcDateTime; }
model OutingOption { eventId: string; title: string; location: string; imageUrl?: string; startTime: utcDateTime; available: boolean; proposedBy?: string; priceRon?: float64; totalPriceRon?: float64; budgetFits?: int32; reactions?: OutingReaction[]; ticketAvailability?: "on_sale" | "upcoming" | "sold_out" | "sales_ended" | "external" | "unavailable"; }
model OutingPlan {
  id: string; ownerId: string; title: string; status: "pending" | "accepted" | "declined";
  outingDate?: string; city?: string; chosenEventId?: string; expiresAt: utcDateTime; members: OutingMember[]; options: OutingOption[];
  revision?: int64; candidateDates?: OutingDateOption[]; decisionAt?: utcDateTime;
  myBudgetRon?: float64; budgetCount?: int32; previousEvents?: OutingPreviousEvent[];
  meetingPoint?: string; meetingAt?: utcDateTime;
}
model CreateOutingPlan { requestId: string; title: string; outingDate?: string; candidateDates?: string[]; decisionAt?: utcDateTime; city: string; eventIds?: string[]; friendIds: string[]; }
model OutingResponse { status: "accepted" | "declined"; }
model OutingEventChoice { eventId: string; }
model OutingEventVote { eventId: string; answer?: OutingAnswer; }
model OutingAvailability { date: string; answer: OutingAnswer; }
model OutingDateChoice { date: string; }
model OutingPreferences { budgetRon?: float64; }
model OutingDeadline { decisionAt: utcDateTime; }
model OutingReopen { revision: int64; reason: "sold_out" | "cancelled" | "other"; }
model OutingMeeting { place: string; at?: utcDateTime; }
model OutingArrivalUpdate { status: OutingArrival; }
model OutingChanges { revision: int64; changed: boolean; }
model OutingMutationResult { ok: boolean; }
model TicketTransfer {
  id: string; ticketId: string; eventId: string; eventTitle: string; senderId: string; senderName: string;
  recipientId: string; recipientName: string; status: "pending" | "accepted" | "declined" | "cancelled" | "expired"; expiresAt: utcDateTime;
}
model CreateTicketTransfer { ticketId: string; recipientEmail: string; requestId: string; }
model RespondTicketTransfer { status: "accepted" | "declined" | "cancelled"; }
@route("/outings") interface Outings {
  @post @route("/meeting-point/{eventID}") meetingPoint(@path eventID:string,@body body: {content:string}): OutingMutationResult;
  @get @route("/plans") plans(): OutingPlan[];
  @post @route("/plans") createPlan(@body body: CreateOutingPlan): OutingPlan;
  @get @route("/plans/{planID}") plan(@path planID: string): OutingPlan;
  @post @route("/plans/{planID}/respond") respond(@path planID: string, @body body: OutingResponse): OutingMutationResult;
  @post @route("/plans/{planID}/proposals") propose(@path planID: string, @body body: OutingEventChoice): OutingMutationResult;
  @post @route("/plans/{planID}/vote") vote(@path planID: string, @body body: OutingEventVote): OutingMutationResult;
  @post @route("/plans/{planID}/choose") choose(@path planID: string, @body body: OutingEventChoice): OutingMutationResult;
  @post @route("/plans/{planID}/availability") availability(@path planID: string, @body body: OutingAvailability): OutingMutationResult;
  @post @route("/plans/{planID}/date") chooseDate(@path planID: string, @body body: OutingDateChoice): OutingMutationResult;
  @post @route("/plans/{planID}/preferences") preferences(@path planID: string, @body body: OutingPreferences): OutingMutationResult;
  @post @route("/plans/{planID}/deadline") deadline(@path planID: string, @body body: OutingDeadline): OutingMutationResult;
  @post @route("/plans/{planID}/reopen") reopen(@path planID: string, @body body: OutingReopen): OutingMutationResult;
  @post @route("/plans/{planID}/meeting") meeting(@path planID: string, @body body: OutingMeeting): OutingMutationResult;
  @post @route("/plans/{planID}/arrival") arrival(@path planID: string, @body body: OutingArrivalUpdate): OutingMutationResult;
  @get @route("/plans/{planID}/changes") changes(@path planID: string, @query revision: int64): OutingChanges;
  @get @route("/transfers") transfers(): TicketTransfer[];
  @post @route("/transfers") createTransfer(@body body: CreateTicketTransfer): TicketTransfer;
  @post @route("/transfers/{transferID}/respond") respondTransfer(@path transferID: string, @body body: RespondTicketTransfer): OutingMutationResult;
}
