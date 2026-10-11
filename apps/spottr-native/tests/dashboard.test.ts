import test from "node:test";
import assert from "node:assert/strict";
import {
  createDashboardApi,
  draftFromEvent,
  emptyEvent,
  eventErrors,
  eventPath,
  eventPayload,
  list,
  promoPayload,
  promotionDates,
  validHttps,
  type DashboardEvent,
  type EventDraft,
} from "../src/dashboard/data";
import { createHttp } from "../src/data/http";
import { resources } from "../../pulse-app/src/i18n/resources";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const id = "00000000-0000-4000-8000-000000000001";
const draft = (extra: Partial<EventDraft> = {}): EventDraft => ({
  ...emptyEvent(),
  title: "New event",
  description: "Event description",
  city: "Bucuresti",
  locationName: "Club",
  googlePlaceId: "ChIJ-test-venue",
  vibe: "Energetic",
  latitude: 44,
  longitude: 26,
  startTime: "2099-07-05T20:00",
  endTime: "2099-07-06T06:00",
  vatPercentage: 21,
  ...extra,
});
test("event form rejects empty inputs, invalid coordinates/dates and missing fiscal choice", () => {
  assert.ok(Object.keys(eventErrors(emptyEvent())).length >= 7);
  assert.deepEqual(eventErrors(draft()), {});
  for (const latitude of [NaN, Infinity, -91, 91])
    assert.ok(eventErrors(draft({ latitude })).latitude);
  for (const longitude of [NaN, Infinity, -181, 181])
    assert.ok(eventErrors(draft({ longitude })).longitude);
  assert.ok(eventErrors(draft({ endTime: "2099-07-05T20:00" })).endTime);
  assert.ok(eventErrors(draft({ startTime: "" })).startTime);
  assert.ok(eventErrors(draft({ vatPercentage: undefined })).vatPercentage);
  assert.ok(
    eventErrors(draft({ status: "scheduled", publishAt: "2020-01-01" }))
      .publishAt,
  );
  assert.ok(eventErrors(draft({ status: "completed" })).status);
  assert.throws(() => eventPayload(emptyEvent()));
});
test("external tickets require safe HTTPS and omit native inventory/tax fields from mutation", () => {
  for (const value of [
    "javascript:alert(1)",
    "http://example.com",
    "https://user:pass@example.com",
    "not-a-url",
  ])
    assert.equal(validHttps(value), false);
  const body = eventPayload(
    draft({
      externalTicketUrl: "https://tickets.example.com/event",
      vatPercentage: undefined,
      organizerAbsorbsServiceFee: true,
      ticketTypes: [
        {
          name: "Bad",
          priceRon: -1,
          capacity: 0,
          startSales: "",
          endSales: "",
        },
      ],
    }),
  );
  assert.deepEqual(body.ticketTypes, []);
  assert.equal(body.vatPercentage, undefined);
  assert.equal(body.organizerAbsorbsServiceFee, false);
});
test("ticket validation enforces stock, prices and sales windows, preserving existing IDs", () => {
  const ticket = {
    id,
    name: "General",
    priceRon: 50,
    capacity: 100,
    startSales: "2099-07-01T12:00",
    endSales: "2099-07-05T20:00",
  };
  assert.deepEqual(eventErrors(draft({ ticketTypes: [ticket] })), {});
  for (const patch of [
    { capacity: 0 },
    { capacity: 1.5 },
    { priceRon: NaN },
    { priceRon: -1 },
    { name: "" },
    { endSales: ticket.startSales },
  ])
    assert.ok(
      eventErrors(draft({ ticketTypes: [{ ...ticket, ...patch }] }))[
        "ticketTypes.0"
      ],
    );
  const body = eventPayload(draft({ ticketTypes: [ticket] }));
  assert.equal((body.ticketTypes![0] as { id?: string }).id, id);
  assert.ok(body.ticketTypes![0]!.startSales.endsWith("Z"));
});
test("local timestamp round-trip does not relabel UTC clock time", () => {
  const event = {
    ...draft(),
    id,
    organizerId: id,
    startTime: "2099-07-05T17:00:00Z",
    endTime: "2099-07-06T03:00:00Z",
    isLive: false,
    createdAt: "2099-07-01T00:00:00Z",
    ticketTypes: [],
    lineup: [],
    stats: {},
  } as unknown as DashboardEvent;
  const result = eventPayload(draftFromEvent(event));
  assert.equal(Date.parse(result.startTime), Date.parse(event.startTime));
  assert.equal(Date.parse(result.endTime), Date.parse(event.endTime));
  const template = draftFromEvent(
    {
      ...event,
      ticketTypes: [
        {
          id,
          name: "General",
          priceRon: 0,
          capacity: 1,
          startSales: event.startTime,
          endSales: event.endTime,
        },
      ],
    },
    true,
  );
  assert.equal(template.ticketTypes![0]!.id, undefined);
  assert.equal(template.status, "draft");
});
test("promo code boundaries reject fractional, NaN and oversized redemption counts", () => {
  assert.deepEqual(promoPayload(" first ", "10", ""), {
    code: "FIRST",
    discountPercent: 10,
    maxRedemptions: undefined,
  });
  assert.equal(promoPayload("AB_", "90", "1").discountPercent, 90);
  for (const args of [
    ["AB", "10", ""],
    ["A".repeat(41), "10", ""],
    ["BAD!", "10", ""],
    ["CODE", "0", ""],
    ["CODE", "91", ""],
    ["CODE", "NaN", ""],
    ["CODE", "2.5", ""],
    ["CODE", "10", "0"],
    ["CODE", "10", "1.5"],
    ["CODE", "10", "Infinity"],
  ])
    assert.throws(() => promoPayload(...(args as [string, string, string])));
});
test("campaign options never overrun event end, Thursday plans and calendar boundaries", () => {
  const plan = {
    id: "thu_sat",
    placement: "home_banner",
    name: "Weekend",
    description: "",
    days: 3,
    amountRon: 100,
  } as const;
  const dates = promotionDates(
    plan,
    "2026-10-20T23:59:59",
    new Date(2026, 9, 10),
  );
  assert.deepEqual(dates, ["2026-10-15"]);
  assert.deepEqual(
    promotionDates(plan, "2026-10-11T00:00", new Date(2026, 9, 10)),
    [],
  );
  assert.equal(
    promotionDates(
      { ...plan, id: "one_day", days: 1 },
      "2026-10-11T00:00",
      new Date(2026, 9, 10),
    )[0],
    "2026-10-10",
  );
});
test("dashboard endpoint IDs and nullable list envelopes are validated", () => {
  assert.equal(eventPath(id), `/dashboard/events/${id}`);
  for (const value of ["../users/me", "undefined", "", `${id}/delete`])
    assert.throws(() => eventPath(value));
  assert.deepEqual(list(null), []);
  assert.deepEqual(list([]), []);
  assert.throws(() => list({}));
  assert.throws(() => list([null]));
});
test("event create/update/delete target precise API methods and do not serialize transient UI data", async () => {
  const calls: Array<{ url: string; method: string; body: any }> = [];
  const api = createDashboardApi(
    createHttp("https://api.test", async (input, init) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return new Response(JSON.stringify({ id }), { status: 200 });
    }),
  );
  await api.saveEvent(draft());
  await api.saveEvent(draft(), id);
  await api.deleteEvent(id);
  assert.deepEqual(
    calls.map((c) => c.method),
    ["POST", "POST", "DELETE"],
  );
  assert.equal(calls[1]?.url, `https://api.test/dashboard/events/${id}`);
  assert.equal(
    calls[0]?.body.startTime,
    new Date(draft().startTime).toISOString(),
  );
  assert.equal(calls[0]?.body.id, undefined);
});
test("dashboard literal copy resolves from the original Next.js dictionaries", () => {
  const directory = join(import.meta.dirname, "../src/dashboard");
  const missing: string[] = [];
  for (const file of readdirSync(directory).filter((f) => f.endsWith(".tsx"))) {
    const source = readFileSync(join(directory, file), "utf8");
    for (const match of source.matchAll(
      /['"]((?:feedback|common|promotions|finance|invoicing|refundAttention|organizerProfile|eventForm|eventEditor|ticketForm|validation|dashboard|dashboardNav|invitations|promoCodes|organizerUpdates|checkout|lineup|settings|userProfile)\.[\w.]+)['"]/g,
    )) {
      const key = match[1]!;
      if (key.endsWith(".")) continue;
      for (const language of ["en", "ro"] as const) {
        const lookup = (value: string) =>
          value
            .split(".")
            .reduce<unknown>(
              (current, part) =>
                current && typeof current === "object"
                  ? (current as Record<string, unknown>)[part]
                  : undefined,
              resources[language].translation,
            );
        if (lookup(key) === undefined && lookup(key + "_other") === undefined)
          missing.push(`${file}:${language}:${key}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});
