import test from "node:test";
import assert from "node:assert/strict";
import {
  dashboardEventGroups,
  filterDashboardEvents,
  parseDashboardEventFilter,
} from "../../pulse-app/src/features/events/dashboardEvents";

const now = Date.parse("2026-10-30T18:00:00Z");
const event = (
  id: string,
  start: number,
  end: number,
  status = "published",
) => ({
  id,
  title: id,
  status,
  startTime: new Date(now + start * 3600000).toISOString(),
  endTime: new Date(now + end * 3600000).toISOString(),
});
const next = event("first", 2, 4),
  later = event("second", 3, 6),
  live = event("live", -2, 1),
  past = event("past", -6, -1),
  old = event("old", -48, -24);
const events = [later, old, live, next, past];

test("upcoming events are chronological including times within the same day", () => {
  assert.deepEqual(dashboardEventGroups(events, now).upcoming, [next, later]);
  assert.deepEqual(filterDashboardEvents(events, "upcoming", "", now), [
    next,
    later,
  ]);
  assert.deepEqual(events, [later, old, live, next, past]);
});
test("events move into past only when they finish; latest finish comes first", () => {
  assert.deepEqual(dashboardEventGroups(events, now).past, [past, old]);
  assert.deepEqual(filterDashboardEvents(events, "completed", "", now), [
    past,
    old,
  ]);
  assert.equal(
    dashboardEventGroups([live], Date.parse(live.endTime)).past[0],
    live,
  );
});
test("all events show live then upcoming then past, without losing cancelled events", () => {
  const cancelled = event("cancelled", 2, 4, "cancelled");
  assert.deepEqual(
    filterDashboardEvents([...events, cancelled], "all", "", now),
    [live, next, later, past, old, cancelled],
  );
  assert.deepEqual(dashboardEventGroups([cancelled], now).upcoming, []);
});
test("list search respects the selected timeline and status", () => {
  assert.deepEqual(filterDashboardEvents(events, "upcoming", " FIRST ", now), [
    next,
  ]);
  assert.deepEqual(filterDashboardEvents(events, "completed", "live", now), []);
  const draft = event("draft", 1, 3, "draft");
  assert.deepEqual(
    filterDashboardEvents([...events, draft], "draft", "", now),
    [draft],
  );
});
test("timeline links accept only supported filter values", () => {
  assert.equal(parseDashboardEventFilter("upcoming"), "upcoming");
  assert.equal(parseDashboardEventFilter("completed"), "completed");
  for (const value of [null, undefined, "invalid", ["upcoming"], {}])
    assert.equal(parseDashboardEventFilter(value), "all");
});
