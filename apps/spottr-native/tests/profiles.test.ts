import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfilesApi, loadOrganizerEvents, parseProfile, parseProfiles, parseUpdates, profileAction, splitOrganizerEvents } from '../src/profiles/data';
import { normalizeEvent } from '../src/data/events';
import { ApiError, createHttp } from '../src/data/http';

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const row = (extra = {}) => ({ id: id(1), username: 'Alex', role: 'user', relationship: 'none', ...extra });
const profile = (extra = {}) => parseProfile(row(extra));

test('profile validates identity, role and relationship before showing actionable controls', () => {
  for (const value of [null, undefined, [], '', row({ id: '../me' }), row({ username: null }), row({ role: 'unknown' }), row({ relationship: 'unknown' })]) assert.throws(() => parseProfile(value));
  assert.throws(() => parseProfile(row(), id(2)));
  const result = profile({ avatarUrl: 'javascript:alert(1)', bio: null, followerCount: -1, ticketsSoldCount: Infinity, eventCount: 1.4 });
  assert.equal(result.avatarUrl, undefined); assert.equal(result.bio, undefined);
  assert.equal(result.followerCount, 0); assert.equal(result.ticketsSoldCount, 0); assert.equal(result.eventCount, 0);
});
test('search accepts empty responses, deduplicates profiles and surfaces completely invalid payloads', () => {
  assert.deepEqual(parseProfiles(null), []); assert.deepEqual(parseProfiles(undefined), []); assert.deepEqual(parseProfiles([]), []);
  assert.equal(parseProfiles([null, row(), row({ username: 'Updated' })])[0]?.username, 'Updated');
  assert.throws(() => parseProfiles({})); assert.throws(() => parseProfiles([null]));
});
test('actions follow original guest, self, organizer and friendship rules', () => {
  const viewer = { id: id(2), role: 'user' };
  assert.equal(profileAction(profile()), 'signin');
  assert.equal(profileAction(profile({ relationship: 'self' }), viewer), null);
  assert.equal(profileAction(profile(), { ...viewer, id: id(1) }), null);
  assert.equal(profileAction(profile(), { ...viewer, role: 'organizer' }), null);
  for (const [relationship, action] of [['none', 'request'], ['friends', 'remove'], ['pending_sent', 'pending'], ['pending_received', 'accept']]) assert.equal(profileAction(profile({ relationship }), viewer), action);
  assert.equal(profileAction(profile({ role: 'organizer' }), viewer), 'follow');
  assert.equal(profileAction(profile({ role: 'organizer', followsOrganizer: true }), { ...viewer, role: 'organizer' }), 'unfollow');
});
test('organizer event partitions include live events, exact end boundary, and do not mutate cache', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const rows = [
    { id: 1, startTime: '2026-10-11T22:00Z', endTime: '2026-10-12T06:00Z' },
    { id: 2, startTime: '2026-10-10T10:00Z', endTime: '2026-10-10T13:00Z' },
    { id: 3, startTime: '2026-10-10T09:00Z', endTime: '2026-10-10T12:00Z' },
    { id: 4, startTime: '2026-10-01T22:00Z', endTime: '2026-10-02T06:00Z' },
    { id: 5, startTime: 'bad', endTime: 'bad' },
  ];
  const before = JSON.stringify(rows), result = splitOrganizerEvents(rows, now);
  assert.deepEqual(result.upcomingEvents.map(event => event.id), [2, 1]);
  assert.deepEqual(result.pastEvents.map(event => event.id), [3, 4]);
  assert.equal(JSON.stringify(rows), before); assert.deepEqual(splitOrganizerEvents([], now), { upcomingEvents: [], pastEvents: [] });
});
test('organizer pagination includes event 101 and stops on the actual 100-row boundary', async () => {
  const calls: unknown[] = [];
  const events = Array.from({ length: 101 }, (_, index) => normalizeEvent({ id: id(index + 10) })!);
  const result = await loadOrganizerEvents({ async page(filters, page) { calls.push({ filters, page }); const items = events.slice((page! - 1) * 100, page! * 100); return { items, rawCount: items.length, page: page! }; } }, id(1));
  assert.equal(result.length, 101); assert.deepEqual(calls, [{ filters: { organizerId: id(1) }, page: 1 }, { filters: { organizerId: id(1) }, page: 2 }]);
  let requests = 0;
  await loadOrganizerEvents({ async page() { requests++; return { items: events.slice(0, 30), rawCount: 30, page: 1 }; } }, id(1));
  assert.equal(requests, 1);
});
test('stalled organizer pagination fails instead of repeatedly fetching the same page', async () => {
  await assert.rejects(loadOrganizerEvents({ async page(_, number) { return { items: [normalizeEvent({ id: id(3) })!], rawCount: 100, page: number! }; } }, id(1)), /PAGINATION_STALLED/);
  await assert.rejects(loadOrganizerEvents({ async page() { throw Error('must not fetch'); } }, 'invalid'), (error: unknown) => error instanceof ApiError && error.status === 404);
});
test('updates remove expired/unsafe entries and deduplicate while preserving captions', () => {
  const now = Date.parse('2026-10-10T12:00:00Z');
  const update = { id: id(1), eventId: id(2), organizerId: id(3), eventTitle: 'After Dark', imageUrl: 'https://cdn.example.test/banner.webp', createdAt: '2026-10-10T10:00Z', expiresAt: '2026-10-11T10:00Z', caption: 'Tonight' };
  const result = parseUpdates([null, update, update, { ...update, id: id(4), expiresAt: '2026-10-10T12:00Z' }, { ...update, id: id(5), imageUrl: 'file:///private' }], now);
  assert.equal(result.length, 1); assert.equal(result[0]?.caption, 'Tonight');
  assert.deepEqual(parseUpdates(null), []); assert.throws(() => parseUpdates({}));
});
test('search trims and encodes user input, skips one character, and rejects oversize/invalid identities locally', async () => {
  const urls: string[] = [];
  const api = createProfilesApi(createHttp('https://api.example.test', async url => { urls.push(String(url)); return new Response(JSON.stringify([row()])); }));
  assert.deepEqual(await api.search(' a '), []);
  await api.search(' Alex & Bea ');
  assert.equal(urls[0], 'https://api.example.test/profiles/search?q=Alex%20%26%20Bea');
  await assert.rejects(api.search('x'.repeat(121))); await assert.rejects(api.profile('invalid'));
  assert.equal(urls.length, 1);
});
test('friend request honors a concurrent server-side acceptance and transmits correct operations', async () => {
  const calls: { url: string; method?: string; body?: BodyInit | null; authorization: string | null }[] = [];
  const api = createProfilesApi(createHttp('https://api.example.test', async (url, options) => {
    calls.push({ url: String(url), method: options?.method, body: options?.body, authorization: new Headers(options?.headers).get('authorization') });
    return new Response(JSON.stringify({ relationship: options?.method === 'DELETE' ? 'none' : 'friends' }));
  }));
  assert.deepEqual(await api.change(profile(), 'request', 'test-only'), { relationship: 'friends' });
  assert.deepEqual(await api.change(profile({ relationship: 'pending_received' }), 'accept', 'test-only'), { relationship: 'friends' });
  assert.deepEqual(await api.change(profile({ relationship: 'friends' }), 'remove', 'test-only'), { relationship: 'none' });
  assert.deepEqual(calls.map(call => call.method), ['POST', 'PUT', 'DELETE']);
  assert.equal(calls[1]?.body, '{"status":"accepted"}'); assert.equal(calls[0]?.authorization, 'Bearer test-only');
  await assert.rejects(api.change(profile(), 'pending', 'test-only')); assert.equal(calls.length, 3);
});
test('follow uses server truth and never decrements follower count below zero', async () => {
  const api = createProfilesApi(createHttp('https://api.example.test', async () => new Response('{"followsOrganizer":false}')));
  assert.deepEqual(await api.change(profile({ role: 'organizer', followsOrganizer: true, followerCount: 0 }), 'unfollow', 'test-only'), { followsOrganizer: false, followerCount: 0 });
  assert.deepEqual(await api.change(profile({ role: 'organizer', followerCount: 10 }), 'follow', 'test-only'), { followsOrganizer: false, followerCount: 10 });
});
test('profile requests preserve abort and server failures for retry/error UI', async () => {
  const denied = createProfilesApi(createHttp('https://api.example.test', async () => new Response('{}', { status: 404 })));
  await assert.rejects(denied.profile(id(1)), (error: unknown) => error instanceof ApiError && error.status === 404);
  const controller = new AbortController(); controller.abort();
  const aborted = createProfilesApi(createHttp('https://api.example.test', async (_, options) => { options?.signal?.throwIfAborted(); return new Response('{}'); }));
  await assert.rejects(aborted.profile(id(1), controller.signal), { name: 'AbortError' });
});

test('profile category is sent to the API and older servers cannot mix categories', async () => {
  const urls: string[] = [];
  const api = createProfilesApi(createHttp('https://api.example.test', async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify([row(), row({ id: id(2), role: 'organizer' })]));
  }));
  assert.deepEqual((await api.search('club', undefined, 'organizers')).map(p => p.id), [id(2)]);
  assert.ok(urls[0]?.endsWith('q=club&kind=organizers'));
  assert.deepEqual((await api.search('club', undefined, 'people')).map(p => p.id), [id(1)]);
  assert.ok(urls[1]?.endsWith('q=club&kind=people'));
});
