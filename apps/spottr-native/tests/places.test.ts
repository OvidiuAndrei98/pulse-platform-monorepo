import test from "node:test";
import assert from "node:assert/strict";
import { createHttp } from "../src/data/http";
import { createPlaceSearch, createPlacesApi, parsePredictions, parseVenue, type PlacePrediction, type Venue } from "../src/dashboard/places";
import { emptyEvent, eventErrors } from "../src/dashboard/data";

const session = "00000000-0000-4000-8000-000000000001";
const prediction: PlacePrediction = { placeId: "ChIJ_venue-1", name: "Club", description: "Club, București" };
const venue: Venue = { placeId: prediction.placeId, name: "Club", lat: 44, lng: 26 };
const sleep = () => new Promise(resolve => setTimeout(resolve, 5));
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((r, e) => { resolve = r; reject = e; }); return { promise, resolve, reject }; }
test("venue responses reject empty/malformed coordinates and preserve valid equator/meridian values", () => {
  assert.deepEqual(parsePredictions([]), []);
  assert.deepEqual(parsePredictions([prediction]), [prediction]);
  for (const invalid of [null, undefined, {}, [null], [{...prediction, placeId: "https://bad.test"}], [{...prediction, name: ""}]]) assert.throws(() => parsePredictions(invalid));
  assert.deepEqual(parseVenue({ ...venue, lat: 0, lng: 0 }, prediction.placeId), {...venue, lat: 0, lng: 0});
  for (const invalid of [null, undefined, {}, {...venue, lat: null}, {...venue, lat: Infinity}, {...venue, lat: 91}, {...venue, lng: -181}, {...venue, placeId: "other"}]) assert.throws(() => parseVenue(invalid, prediction.placeId));
});
test("Places API bounds inputs before network, encodes queries and preserves session/language", async () => {
  const calls: URL[] = [];
  const api = createPlacesApi(createHttp("https://example.test/api/v1", async input => {
    const url = new URL(String(input)); calls.push(url);
    return new Response(JSON.stringify(url.pathname.endsWith("/details") ? venue : [prediction]));
  }));
  const signal = new AbortController().signal;
  assert.deepEqual(await api.search(" ", session, "ro", signal), []);
  await assert.rejects(api.search("x".repeat(121), session, "ro", signal));
  await assert.rejects(api.search("xx", "", "ro", signal));
  await assert.rejects(api.details("../secret", session, "ro", signal));
  assert.equal(calls.length, 0);
  assert.deepEqual(await api.search(" Club & Co ", session, "ro", signal), [prediction]);
  assert.equal(calls[0]!.searchParams.get("q"), "Club & Co");
  assert.equal(calls[0]!.searchParams.get("session"), session);
  assert.equal(calls[0]!.searchParams.get("language"), "ro");
  assert.deepEqual(await api.details(prediction.placeId, session, "fr", signal), venue);
  assert.equal(calls[1]!.searchParams.get("language"), "en");
});
test("slower old autocomplete cannot replace latest query and clearing removes results immediately", async () => {
  const old = deferred<PlacePrediction[]>(), latest = deferred<PlacePrediction[]>();
  let calls = 0;
  const search = createPlaceSearch({ api: { search: async () => ++calls === 1 ? old.promise : latest.promise, details: async () => venue }, nonce: () => session, language: "ro", onState: () => {}, onSelect: () => {}, delay: 0 });
  search.change("Club"); await sleep(); search.change("Venue"); await sleep();
  latest.resolve([{...prediction, name: "Latest"}]); await sleep();
  old.resolve([{...prediction, name: "Old"}]); await sleep();
  assert.equal(search.getState().query, "Venue");
  assert.equal(search.getState().predictions[0]?.name, "Latest");
  search.change(""); assert.equal(search.getState().loading, false); assert.deepEqual(search.getState().predictions, []);
  search.dispose();
});
test("typing during place details prevents obsolete venue and coordinate selection", async () => {
  const details = deferred<Venue>(), selections: Venue[] = [];
  const search = createPlaceSearch({ api: { search: async () => [prediction], details: async () => details.promise }, nonce: () => session, language: "en", onState: () => {}, onSelect: value => selections.push(value), delay: 0 });
  search.change("Club"); await sleep();
  const selecting = search.select(prediction);
  search.change("Other"); details.resolve(venue); await selecting;
  assert.equal(search.getState().query, "Other"); assert.deepEqual(selections, []);
  search.dispose();
});
test("duplicate taps resolve venue once; Google billing token rotates after selection", async () => {
  const sessions: string[] = [], details = deferred<Venue>(); let nonce = 0, detailCalls = 0;
  const selected: Venue[] = [];
  const search = createPlaceSearch({ api: { search: async (_q, token) => { sessions.push(token); return [prediction]; }, details: async (_id, token) => { sessions.push(token); detailCalls++; return details.promise; } }, nonce: () => `session-${++nonce}`, language: "en", onState: () => {}, onSelect: v => selected.push(v), delay: 0 });
  search.change("Cl"); await sleep(); search.change("Club"); await sleep();
  const pending = search.select(prediction); await search.select(prediction);
  assert.equal(detailCalls, 1); details.resolve(venue); await pending;
  assert.deepEqual(selected, [venue]);
  search.change("Next"); await sleep();
  assert.deepEqual(sessions, ["session-1", "session-1", "session-1", "session-2"]);
  search.dispose();
});
test("failed searches settle loading and support retry; unmount aborts pending results", async () => {
  let fails = true, calls = 0; const pending = deferred<PlacePrediction[]>();
  const search = createPlaceSearch({ api: { search: async () => { calls++; if (fails) throw new Error("offline"); return pending.promise; }, details: async () => venue }, nonce: () => session, language: "en", onState: () => {}, onSelect: () => {}, delay: 0 });
  search.change("Club"); await sleep(); assert.equal(search.getState().error, true); assert.equal(search.getState().loading, false);
  fails = false; search.retry(); await sleep(); assert.equal(calls, 2);
  search.dispose(); pending.resolve([prediction]); await sleep(); assert.deepEqual(search.getState().predictions, []);
});
test("create-event cannot silently submit text-only venue with stale or default zero coordinates", () => {
  const draft = { ...emptyEvent(), title: "Party", description: "Description", category: "TECHNO", city: "Bucuresti", locationName: "Typed club", vibe: "Energetic", latitude: 44, longitude: 26, startTime: "2099-01-01T20:00", endTime: "2099-01-02T08:00", vatPercentage: 21 as const };
  assert.ok(eventErrors(draft).locationName);
  assert.deepEqual(eventErrors({...draft, googlePlaceId: prediction.placeId}), {});
  assert.ok(Number.isNaN(emptyEvent().latitude));
});
