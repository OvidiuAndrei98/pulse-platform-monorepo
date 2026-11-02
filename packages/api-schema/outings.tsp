import "@typespec/http";
using TypeSpec.Http;
namespace Pulse;
model OutingMember { userId: string; username: string; status: "pending" | "accepted" | "declined"; voteEventId?: string; }
model OutingOption { eventId: string; title: string; location: string; startTime: utcDateTime; available: boolean; }
model OutingPlan {
  id: string; ownerId: string; title: string; status: "pending" | "accepted" | "declined";
  chosenEventId?: string; expiresAt: utcDateTime; members: OutingMember[]; options: OutingOption[];
}
model CreateOutingPlan { requestId: string; title: string; eventIds: string[]; friendIds: string[]; }
model OutingResponse { status: "accepted" | "declined"; }
model OutingEventChoice { eventId: string; }
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
  @post @route("/plans/{planID}/vote") vote(@path planID: string, @body body: OutingEventChoice): OutingMutationResult;
  @post @route("/plans/{planID}/choose") choose(@path planID: string, @body body: OutingEventChoice): OutingMutationResult;
  @get @route("/transfers") transfers(): TicketTransfer[];
  @post @route("/transfers") createTransfer(@body body: CreateTicketTransfer): TicketTransfer;
  @post @route("/transfers/{transferID}/respond") respondTransfer(@path transferID: string, @body body: RespondTicketTransfer): OutingMutationResult;
}
