import "@typespec/http";
using TypeSpec.Http;
namespace Pulse;

model WardrobeItems { coat: int32; bag: int32; backpack: int32; }
model WardrobeEvent { id: string; title: string; canManage: boolean; startTime?:string; location?:string; }
model WardrobeZone { id: string; name: string; @pattern("^[A-Z]{1,8}$") prefix: string; kind: "any" | "coat" | "bag"; capacity: int32; enabled: boolean; revision: int32; occupied: int32; }
model WardrobeDeposit {
 id: string; eventId: string; eventTitle: string; userId: string | null; customerName: string;
 zoneId: string; zoneName: string; number: string; status: "reserved" | "stored" | "returned" | "cancelled";
 items: WardrobeItems; remaining: WardrobeItems; revision: int32; reservedUntil: utcDateTime;
 createdAt: utcDateTime; storedAt: utcDateTime | null; returnedAt: utcDateTime | null;
 pickupId: string | null; pickupItems: WardrobeItems | null; pickupExpiresAt: utcDateTime | null; pickupApproved: boolean | null;
}
model WardrobeMine { deposits: WardrobeDeposit[]; staffAccess: boolean; }
model WardrobeStaff { id: string; name: string; role: "operator" | "supervisor"; }
model WardrobeAudit { id: string; action: string; actor: string; depositId: string | null; details: Record<unknown>; at: utcDateTime; }
model WardrobeOverview {
 eventId: string; title: string; canManage: boolean; canRecover: boolean; accepting: boolean;
 eventEnded: boolean; unclaimedCount: int64; unclaimedItems: int64;
 zones: WardrobeZone[]; staff: WardrobeStaff[]; deposits: WardrobeDeposit[]; nextCursor: string; audit: WardrobeAudit[];
}
model WardrobeCommand {
 action: "zone" | "staff" | "remove-staff" | "lookup" | "reserve" | "store" | "cancel" | "move" | "request-pickup" | "return" | "recover";
 code?: string; zoneId?: string; depositId?: string; requestId?: string; revision?: int32;
 items?: WardrobeItems; additional?: boolean; pickupId?: string; reason?: string;
 name?: string; @pattern("^[A-Z]{1,8}$") prefix?: string; kind?: "any" | "coat" | "bag"; capacity?: int32; enabled?: boolean;
 email?: string; role?: "operator" | "supervisor"; userId?: string;
}
model WardrobeCommandResult { deposit?: WardrobeDeposit; deposits?: WardrobeDeposit[]; ok?: boolean; }
@error model WardrobeError { @statusCode statusCode: 400 | 401 | 403 | 404 | 409 | 500; @body response: { error: string; }; }
@route("/wardrobe") interface WardrobeOperations {
 @get @route("/mine") myWardrobe(): WardrobeMine | WardrobeError;
 @post @route("/mine/{depositId}/confirm") approveWardrobePickup(@path depositId: string, @body payload: { pickupId: string; approve: boolean; }): { ok: boolean; } | WardrobeError;
 @get @route("/events") wardrobeEvents(): WardrobeEvent[] | WardrobeError;
 @get @route("/events/{eventId}") wardrobeOverview(@path eventId: string, @query q?: string, @query history?: boolean, @query unclaimed?: boolean, @query before?: string): WardrobeOverview | WardrobeError;
 @get @route("/events/{eventId}/deposits/{depositId}") wardrobeDeposit(@path eventId: string, @path depositId: string): { deposit: WardrobeDeposit; } | WardrobeError;
 @post @route("/events/{eventId}/commands") wardrobeCommand(@path eventId: string, @body payload: WardrobeCommand): WardrobeCommandResult | WardrobeError;
}
