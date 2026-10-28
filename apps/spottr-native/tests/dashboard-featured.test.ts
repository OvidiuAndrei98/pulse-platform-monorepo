import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardTicketCounts,
  isDashboardEventLive,
  selectDashboardEvent,
} from "../../pulse-app/src/features/events/dashboardFeatured";

const now = Date.parse("2026-10-30T18:30:00Z");
const event = {
  id: "next",
  status: "published",
  startTime: "2026-10-30T19:00:00Z",
  endTime: "2026-10-31T03:00:00Z",
};

test("entry scans appear 30 minutes before start without declaring the event live", () => {
  const early = {
    ...event,
    stats: {
      totalTicketsSold: 80,
      totalTicketsScanned: 12,
      totalCheckIns: 999,
    },
  };
  assert.deepEqual(dashboardTicketCounts(early), { sold: 80, scanned: 12 });
  assert.equal(isDashboardEventLive(early, now), false);
  assert.equal(selectDashboardEvent([early], now), early);
});

test("live events keep priority over future events and move on at the exact end", () => {
  const live = {
    ...event,
    id: "live",
    startTime: "2026-10-30T16:00:00Z",
    endTime: "2026-10-30T19:00:00Z",
  };
  const events = [event, live];
  assert.equal(selectDashboardEvent(events, now), live);
  assert.equal(selectDashboardEvent(events, Date.parse(live.endTime)), event);
  assert.equal(isDashboardEventLive(live, Date.parse(live.startTime)), true);
  assert.equal(isDashboardEventLive(live, Date.parse(live.endTime)), false);
  assert.deepEqual(
    events,
    [event, live],
    "selection never reorders the cached API list",
  );
});

test("cancelled, ended and invalid events cannot replace the next usable event", () => {
  for (const status of ["cancelled", "canceled", "completed", "unknown"]) {
    assert.equal(selectDashboardEvent([{ ...event, status }], now), undefined);
  }
  assert.equal(
    selectDashboardEvent([{ ...event, endTime: event.startTime }], now),
    undefined,
  );
  assert.equal(
    selectDashboardEvent([{ ...event, startTime: "invalid" }], now),
    undefined,
  );
  assert.equal(
    selectDashboardEvent([event], Date.parse(event.endTime)),
    undefined,
  );
  for (const status of ["draft", "scheduled"]) {
    const draft = { ...event, status };
    assert.equal(selectDashboardEvent([draft], now), draft);
    assert.equal(
      selectDashboardEvent([draft], Date.parse(event.startTime)),
      undefined,
    );
  }
});

test("zero sales are visible; scans only appear after the first validation", () => {
  assert.deepEqual(
    dashboardTicketCounts({
      stats: { totalTicketsSold: 0, totalTicketsScanned: 0 },
    }),
    { sold: 0, scanned: undefined },
  );
  assert.deepEqual(
    dashboardTicketCounts({
      stats: { totalTicketsSold: 80, totalTicketsScanned: 1 },
    }),
    { sold: 80, scanned: 1 },
  );
});

test("missing or invalid stats never fall back to reserved stock or social check-ins", () => {
  const oldApi = {
    stats: { totalTicketsSold: undefined, totalCheckIns: 30 },
    ticketTypes: [{ ticketsSold: 40 }],
  };
  assert.deepEqual(dashboardTicketCounts(oldApi), {
    sold: undefined,
    scanned: undefined,
  });
  for (const value of [-1, NaN, Infinity, 1.5]) {
    assert.deepEqual(
      dashboardTicketCounts({
        stats: { totalTicketsSold: value, totalTicketsScanned: value },
      }),
      { sold: undefined, scanned: undefined },
    );
  }
  assert.deepEqual(
    dashboardTicketCounts({
      externalTicketUrl: "https://tickets.example",
      stats: { totalTicketsSold: 0, totalTicketsScanned: 0 },
    }),
    { sold: undefined, scanned: undefined },
  );
});
