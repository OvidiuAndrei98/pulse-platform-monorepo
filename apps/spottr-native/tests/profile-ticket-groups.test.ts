import test from "node:test";
import assert from "node:assert/strict";
import { profileTicketGroups } from "../src/profile/ticketGroups";
import type { UserTicket } from "../src/data/tickets";

const now = Date.parse("2026-10-12T12:00:00Z");
function ticket(
  id: string,
  eventId: string,
  startTime: string,
  overrides: Partial<UserTicket> = {},
): UserTicket {
  return {
    id,
    eventId,
    startTime,
    endTime: "2026-12-31T00:00:00Z",
    isValidated: false,
    eventTitle: eventId,
    ticketTypeName: "General",
    locationName: "Bucuresti",
    validationHash: "qr-" + id,
    ...overrides,
  } as UserTicket;
}

test("active profile cards show the earliest event first regardless of purchase/API order", () => {
  const input = [
    ticket("1", "later", "2026-11-01T20:00:00Z"),
    ticket("2", "tonight", "2026-10-12T20:00:00+03:00"),
    ticket("3", "live", "2026-10-12T10:00:00Z"),
  ];
  assert.deepEqual(
    profileTicketGroups(input, "active", now).map((g) => g.eventId),
    ["live", "tonight", "later"],
  );
});

test("grouping preserves all QR identities, ticket types and cached array order", () => {
  const first = ticket("vip", "night", "2026-10-13T20:00:00Z", {
    ticketTypeName: "VIP",
  });
  const second = ticket("general", "night", first.startTime);
  const third = ticket("other", "other-event", "2026-10-14T20:00:00Z");
  const input = Object.freeze([
    Object.freeze(third),
    Object.freeze(first),
    Object.freeze(second),
  ]);
  const groups = profileTicketGroups(input, "active", now);
  assert.deepEqual(groups[0]!.tickets, [first, second]);
  assert.equal(groups[0]!.tickets[0]!.validationHash, "qr-vip");
  assert.deepEqual(
    input.map((t) => t.id),
    ["other", "vip", "general"],
  );
});

test("history is newest first and includes used tickets even before the event ends", () => {
  const input = [
    ticket("1", "old", "2025-01-01T20:00:00Z", {
      endTime: "2025-01-02T04:00:00Z",
    }),
    ticket("2", "used", "2026-10-12T10:00:00Z", { isValidated: true }),
    ticket("3", "recent", "2026-10-11T20:00:00Z", {
      endTime: "2026-10-12T05:00:00Z",
    }),
  ];
  assert.deepEqual(
    profileTicketGroups(input, "history", now).map((g) => g.eventId),
    ["used", "recent", "old"],
  );
  assert.deepEqual(profileTicketGroups(input, "active", now), []);
});

test("a partly used group separates active and history counts without losing either ticket", () => {
  const input = [
    ticket("used", "night", "2026-10-12T10:00:00Z", { isValidated: true }),
    ticket("unused", "night", "2026-10-12T10:00:00Z"),
  ];
  assert.deepEqual(
    profileTicketGroups(input, "active", now)[0]!.tickets.map((t) => t.id),
    ["unused"],
  );
  assert.deepEqual(
    profileTicketGroups(input, "history", now)[0]!.tickets.map((t) => t.id),
    ["used"],
  );
});

test("an event moves to history exactly at its end; empty categories stay empty", () => {
  const input = [
    ticket("1", "night", "2026-10-11T20:00:00Z", {
      endTime: new Date(now).toISOString(),
    }),
  ];
  assert.equal(profileTicketGroups(input, "active", now - 1).length, 1);
  assert.equal(profileTicketGroups(input, "active", now).length, 0);
  assert.equal(profileTicketGroups(input, "history", now).length, 1);
  assert.deepEqual(profileTicketGroups([], "active", now), []);
  assert.deepEqual(profileTicketGroups([], "history", now), []);
});

test("identical start times have a stable order across API refreshes and timezone offsets", () => {
  const a = ticket("1", "a", "2026-10-13T23:00:00+03:00"),
    b = ticket("2", "b", "2026-10-13T20:00:00Z");
  assert.deepEqual(
    profileTicketGroups([b, a], "active", now).map((g) => g.eventId),
    ["a", "b"],
  );
  assert.deepEqual(
    profileTicketGroups([a, b], "active", now).map((g) => g.eventId),
    ["a", "b"],
  );
});
