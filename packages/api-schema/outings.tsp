import "@typespec/http";
using TypeSpec.Http;
namespace Pulse;
alias OutingAnswer = "yes" | "maybe" | "no";
alias OutingArrival = "not_set" | "leaving_soon" | "on_way" | "arrived" | "not_coming";
model OutingReaction { userId: string; answer: OutingAnswer; }
model OutingDateOption { date: string; responses: OutingReaction[]; }
model OutingPreviousEvent { eventId: string; title: string; changedAt: utcDateTime; }
model OutingMember { userId: string; username: string; avatarUrl?: string; status: "pending" | "accepted" | "declined"; voteEventId?: string; hasTicket?: boolean; needsTicket?: boolean; ticketStatusShared?:boolean; hasPreviousTicket?: boolean; arrivalStatus?: OutingArrival; arrivalUpdatedAt?: utcDateTime; attendance?:"yes"|"maybe"|"no"|"unanswered";ticketState?:"unknown"|"none"|"processing"|"offered"|"valid"|"used"|"expired"; }
model OutingOption { eventId: string; eventStatus?:string; title: string; location: string; imageUrl?: string; startTime: utcDateTime; available: boolean; proposedBy?: string; priceRon?: float64; totalPriceRon?: float64; budgetFits?: int32; reactions?: OutingReaction[]; ticketAvailability?: "on_sale" | "upcoming" | "sold_out" | "sales_ended" | "external" | "unavailable"; }
model OutingPlan {
  createdAt?:utcDateTime;
  groupId?:string; lifecycle?:"choosing_date"|"choosing_event"|"event_selected"|"completed"|"cancelled";
  confirmedCount?:int32;readyCount?:int32;allConfirmedReady?:boolean;
  giftPurchasesAvailable?: boolean;
  myPendingPayment?: OutingPendingPayment;
  inviterName?: string; inviterAvatar?: string; decisionRound?: int32;
  id: string; ownerId: string; title: string; status: "pending" | "accepted" | "declined";
  outingDate?: string; city?: string; chosenEventId?: string; expiresAt: utcDateTime; members: OutingMember[]; options: OutingOption[];
  revision?: int64; candidateDates?: OutingDateOption[]; decisionAt?: utcDateTime;
  myBudgetRon?: float64; budgetCount?: int32; previousEvents?: OutingPreviousEvent[];
  meetingPoint?: string; meetingAt?: utcDateTime;
}
model OutingPendingPayment { orderId:string; sessionId?:string; }
model CreateOutingPlan { requestId: string; title: string; outingDate?: string; candidateDates?: string[]; decisionAt?: utcDateTime; city: string; eventIds?: string[]; friendIds: string[]; confirmEvent?: boolean; }
model OutingResponse { status: "accepted" | "declined"; }
model OutingEventChoice { eventId: string; revision?:int64; }
model OutingEventVote { eventId: string; answer?: OutingAnswer; remove?: boolean; revision?:int64; }
model OutingAvailability { date: string; answer: OutingAnswer; revision?:int64; }
model OutingDateChoice { date: string; revision?:int64; }
model OutingPreferences { budgetRon?: float64; }
model OutingTicketStatus { shareStatus: boolean; needsTicket: boolean; }
model OutingPurchase { planId?: string; decisionRound: int32; recipientIds: string[]; extraConfirmed?:boolean; }
model OutingDeadline { decisionAt: utcDateTime; revision?:int64; }
model OutingReopen { revision: int64; reason: "sold_out" | "cancelled" | "other"; }
model OutingMeeting { place: string; at?: utcDateTime; }
model OutingArrivalUpdate { status: OutingArrival; }
model OutingChanges { revision: int64; changed: boolean; }
model OutingMutationResult { ok: boolean; }
model TicketTransfer {
  blockedReason?:"offline_snapshot"|"event_started";
  id: string; ticketId: string; eventId: string; eventTitle: string; senderId: string; senderName: string;
  recipientId: string; recipientName: string; status: "pending" | "accepted" | "declined" | "cancelled" | "expired"; expiresAt: utcDateTime;
}
model CreateTicketTransfer { ticketId: string; recipientEmail: string; requestId: string; }
model RespondTicketTransfer { status: "accepted" | "declined" | "cancelled"; }
@route("/outings") interface Outings {
  #deprecated "The event conversation and meetup are retired."
  @post @route("/meeting-point/{eventID}") meetingPoint(@path eventID:string,@body body: {content:string}): RetiredFeatureResponse;
  @get @route("/plans") plans(): OutingPlan[];
  #deprecated "Create outings explicitly inside a permanent group."
  @post @route("/plans") createPlan(@body body: CreateOutingPlan): RetiredFeatureResponse;
  @get @route("/plans/{planID}") plan(@path planID: string): OutingPlan;
  #deprecated "Historical plan invitations are read-only. Group membership is a separate action."
  @post @route("/plans/{planID}/respond") respond(@path planID: string, @body body: OutingResponse): RetiredFeatureResponse;
  @post @route("/plans/{planID}/proposals") propose(@path planID: string, @body body: OutingEventChoice): OutingMutationResult;
  @post @route("/plans/{planID}/remove-proposal") removeProposal(@path planID:string,@body body:OutingEventChoice):OutingMutationResult;
  @post @route("/plans/{planID}/vote") vote(@path planID: string, @body body: OutingEventVote): OutingMutationResult;
  @post @route("/plans/{planID}/choose") choose(@path planID: string, @body body: OutingEventChoice): OutingMutationResult;
  @post @route("/plans/{planID}/availability") availability(@path planID: string, @body body: OutingAvailability): OutingMutationResult;
  @post @route("/plans/{planID}/date") chooseDate(@path planID: string, @body body: OutingDateChoice): OutingMutationResult;
  #deprecated "Budget preferences are not part of permanent group outings."
  @post @route("/plans/{planID}/preferences") preferences(@path planID: string, @body body: OutingPreferences): RetiredFeatureResponse;
  #deprecated "Ticket visibility is defined by accepted group membership."
  @post @route("/plans/{planID}/ticket-status") ticketStatus(@path planID:string,@body body:OutingTicketStatus): RetiredFeatureResponse;
  @post @route("/plans/{planID}/deadline") deadline(@path planID: string, @body body: OutingDeadline): OutingMutationResult;
  @post @route("/plans/{planID}/reopen") reopen(@path planID: string, @body body: OutingReopen): OutingMutationResult;
  #deprecated "Meetup planning is retired."
  @post @route("/plans/{planID}/meeting") meeting(@path planID: string, @body body: OutingMeeting): RetiredFeatureResponse;
  #deprecated "Travel/arrival tracking is retired."
  @post @route("/plans/{planID}/arrival") arrival(@path planID: string, @body body: OutingArrivalUpdate): RetiredFeatureResponse;
  @get @route("/plans/{planID}/changes") changes(@path planID: string, @query revision: int64): OutingChanges;
  @get @route("/transfers") transfers(): TicketTransfer[];
  @post @route("/transfers") createTransfer(@body body: CreateTicketTransfer): TicketTransfer;
  @post @route("/transfers/{transferID}/respond") respondTransfer(@path transferID: string, @body body: RespondTicketTransfer): OutingMutationResult;
}
