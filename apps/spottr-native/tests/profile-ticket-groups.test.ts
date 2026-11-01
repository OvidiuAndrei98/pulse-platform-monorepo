import test from "node:test";
import assert from "node:assert/strict";
import { historyMonths, initialGroupTicket, profileTicketGroups, ticketTypeSummary } from "../src/profile/ticketGroups";
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

test("a partly used event stays together in Active, opening an unused QR first", () => {
  const input = [
    ticket("used", "night", "2026-10-12T10:00:00Z", { isValidated: true }),
    ticket("unused", "night", "2026-10-12T10:00:00Z"),
  ];
  assert.deepEqual(
    profileTicketGroups(input, "active", now)[0]!.tickets.map((t) => t.id),
    ["used", "unused"],
  );
  assert.deepEqual(
    profileTicketGroups(input, "history", now),
    [],
  );
  assert.equal(initialGroupTicket(input, 'used', true, now), 'unused');
  assert.equal(initialGroupTicket(input, 'used', false, now), 'used');
  const scanned = input.map(t => ({ ...t, isValidated: true }));
  assert.equal(profileTicketGroups(scanned, 'active', now).length, 0);
  assert.equal(profileTicketGroups(scanned, 'history', now)[0]!.tickets.length, 2);
});

test('history groups month boundaries in Bucharest and retains used/expired tickets', () => {
  const input = [ticket('late', 'next-month', '2025-10-31T23:30:00Z', { isValidated: true }),
    ticket('early', 'previous-month', '2025-10-31T20:00:00Z', { endTime: '2025-10-31T21:00:00Z' })];
  const months = historyMonths(profileTicketGroups(input, 'history', now), 'en');
  assert.deepEqual(months.map(m => m.key), ['2025-11', '2025-10']);
  assert.equal(months[0]!.label, 'November 2025');
  assert.deepEqual(months.flatMap(m => m.groups.flatMap(g => g.tickets.map(t => t.id))), ['late', 'early']);
});

test('ticket types reflect the whole event across different purchases', () => {
  const a = ticket('1', 'night', '2026-10-13T20:00:00Z');
  assert.equal(ticketTypeSummary([a, { ...a, id: '2' }, { ...a, id: '3', ticketTypeName: 'VIP' }]), '2 × General · 1 × VIP');
});

test('large wallets have no duplicated event across Active and History', () => {
  const input = Array.from({ length: 2000 }, (_, i) => ticket(String(i), String(Math.floor(i / 4)), '2026-10-13T20:00:00Z', { isValidated: i % 4 !== 0 }));
  const active = profileTicketGroups(input, 'active', now);
  assert.equal(active.length, 500);
  assert.equal(active.reduce((count, group) => count + group.tickets.length, 0), 2000);
  assert.deepEqual(profileTicketGroups(input, 'history', now), []);
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
