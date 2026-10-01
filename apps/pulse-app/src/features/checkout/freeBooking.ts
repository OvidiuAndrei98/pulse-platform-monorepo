import { ApiClient } from "@packages/api-client/src/Client";

export function bookFreeTicket(eventId: string, ticketTypeId: string) {
  return ApiClient.instance.post("/events/{id}/tickets/book", {
    params: { path: { id: eventId } },
    body: { items: [{ ticketTypeId, quantity: 1 }] },
  });
}
