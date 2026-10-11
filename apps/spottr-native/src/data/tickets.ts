import type { components } from "@packages/api-client/src/schema";
import { ApiError } from "./http";
export type UserTicket = components["schemas"]["UserTicketResponse"];
const fields = [
  "id",
  "eventId",
  "validationHash",
  "ticketTypeName",
  "eventTitle",
  "locationName",
  "startTime",
  "endTime",
] as const;
export function parseTickets(value: unknown): UserTicket[] {
  if (value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(0, "INVALID_RESPONSE");
  const seen = new Set<string>();
  return value
    .map((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        fields.some(
          (key) => typeof row[key] !== "string" || !row[key].trim(),
        ) ||
        typeof row.isValidated !== "boolean" ||
        !Number.isFinite(Date.parse(row.startTime)) ||
        !Number.isFinite(Date.parse(row.endTime))
      )
        throw new ApiError(0, "INVALID_RESPONSE");
      for (const key of [
        "ticketPriceBani",
        "ticketingFeeBani",
        "paidTotalBani",
        "priceRon",
        "vatAmountBani",
        "vatPercentage",
      ]) {
        if (
          row[key] !== undefined &&
          (typeof row[key] !== "number" ||
            !Number.isFinite(row[key]) ||
            row[key] < 0)
        )
          throw new ApiError(0, "INVALID_RESPONSE");
      }
      return row as UserTicket;
    })
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
}
export function ticketStatus(ticket: UserTicket, now = Date.now()) {
  if (ticket.isValidated) return "used";
  const end = Date.parse(ticket.endTime);
  return !Number.isFinite(end) || end <= now ? "expired" : "active";
}
