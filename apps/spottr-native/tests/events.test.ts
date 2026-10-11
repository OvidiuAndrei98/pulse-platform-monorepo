import test from 'node:test';
import assert from 'node:assert/strict';
import { availableTickets, ensurePageProgress, formatDate, httpUrl, isLive, mergePages, normalizeEvent, type EventPage } from '../src/data/events';
import { createEventsApi, nextPage, ApiError } from '../src/data/api';
import { parsePreferences, serializedWriter } from '../src/data/preferences';
import { focusManager, onlineManager, InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { eventQueryOptions, homeEventsQueryOptions } from '../src/data/queries';

const uuid = (n = 1) => `12345678-abcd-abcd-abcd-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-10-07T15:00:00Z');
const fixture = (n = 1) => ({ id: uuid(n), title: `Event ${n}`, startTime: '2026-10-07T14:00:00Z', endTime: '2026-10-08T02:00:00Z', ticketTypes: [
  { id: 'standard', name: 'Standard', priceRon: 50, capacity: 10, ticketsSold: 9, startSales: '2026-10-01T00:00:00Z', endSales: '2026-10-08T02:00:00Z' },
] });
const event = (n = 1) => normalizeEvent(fixture(n))!;
const page = (index: number, start: number, count = 20): EventPage => ({ page: index, rawCount: count, items: Array.from({ length: count }, (_, i) => event(start + i)) });
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const apiWith = (fn: typeof fetch, timeout = 1000) => createEventsApi('https://example.test/api/v1/', fn, timeout);
const isCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

test('invalid, null and malformed events never become unopenable cards', () => {
  for (const value of [null, undefined, [], '', {}, { id: '' }, { id: 'not-an-uuid' }]) assert.equal(normalizeEvent(value), null);
  const data = normalizeEvent({ id: uuid().toUpperCase(), title: null, ticketTypes: null, lineup: undefined, latitude: 91, longitude: -181 })!;
  assert.equal(data.id, uuid()); assert.equal(data.title, ''); assert.deepEqual(data.ticketTypes, []); assert.deepEqual(data.lineup, []);
  assert.equal(data.latitude, null); assert.equal(data.longitude, null);
  assert.equal(normalizeEvent({ id: uuid(), latitude: 0, longitude: 0 })!.latitude, 0);
});
test('untrusted image/link schemes and embedded credentials are rejected', () => {
  for (const value of [null, 'javascript:alert(1)', 'data:text/html,hi', 'file:///secret', 'https://user:pass@example.com', '//example.com']) assert.equal(httpUrl(value), undefined);
  assert.equal(httpUrl('https://example.com/banner.webp'), 'https://example.com/banner.webp');
});
test('ticket selection respects stock, zero price, sale boundaries, invalid dates and event expiry', () => {
  const value = event(); assert.equal(availableTickets(value, now)[0]?.priceRon, 50);
  value.ticketTypes.push({ ...value.ticketTypes[0]!, id: 'free', priceRon: 0 });
  assert.equal(availableTickets(value, now)[0]?.id, 'free');
  value.ticketTypes[0]!.ticketsSold = 10; assert.equal(availableTickets(value, now).length, 1);
  value.ticketTypes[1]!.startSales = new Date(now).toISOString(); assert.equal(availableTickets(value, now).length, 1);
  value.ticketTypes[1]!.endSales = new Date(now).toISOString(); assert.equal(availableTickets(value, now).length, 0);
  value.ticketTypes[0]!.ticketsSold = 0; value.ticketTypes[0]!.startSales = 'invalid'; assert.equal(availableTickets(value, now).length, 0);
  assert.equal(availableTickets(event(), Date.parse(event().endTime)).length, 0);
  assert.deepEqual(normalizeEvent({ ...fixture(), ticketTypes: [{ id: 'bad', priceRon: -1, capacity: 5 }, null] })!.ticketTypes, []);
});
test('live status and Romanian event timezone do not depend on device timezone', () => {
  assert.equal(isLive(event(), now), true); assert.equal(isLive(event(), Date.parse(event().endTime)), false);
  assert.equal(formatDate('invalid', 'ro', true), '—');
  assert.match(formatDate('2026-10-07T12:00:00Z', 'en', true), /15:00/);
});
test('pagination stops on a short or empty page and merges overlap by event ID', () => {
  assert.equal(nextPage(page(1, 1)), 2); assert.equal(nextPage(page(2, 21, 1)), undefined); assert.equal(nextPage(page(2, 21, 0)), undefined);
  assert.equal(mergePages([page(1, 1), page(2, 20)]).length, 39);
  assert.throws(() => ensurePageProgress(page(2, 1), page(1, 1).items.map(e => e.id)), /PAGINATION_STALLED/);
  ensurePageProgress(page(2, 20), page(1, 1).items.map(e => e.id));
});
test('API encodes search/category/city correctly and validates query/page boundaries', async () => {
  let url = '';
  const api = apiWith(async input => { url = String(input); return reply([]); });
  await api.page({ q: '  ȘȚ & 🎉  ', category: 'DRUM & BASS', city: 'Bucuresti' }, 2);
  const parsed = new URL(url); assert.equal(parsed.searchParams.get('q'), 'ȘȚ & 🎉'); assert.equal(parsed.searchParams.get('category'), 'DRUM & BASS'); assert.equal(parsed.searchParams.get('page'), '2');
  for (const number of [0, -1, 1.5, NaN, Infinity, 100001]) await assert.rejects(api.page({}, number), isCode('INVALID_PAGE'));
  await api.page({ q: '🎉'.repeat(120) }); await assert.rejects(api.page({ q: '🎉'.repeat(121) }), isCode('INVALID_QUERY'));
});
test('API handles null lists, mixed rows, malformed JSON, server errors and missing details', async () => {
  assert.deepEqual((await apiWith(async () => reply(null)).page()).items, []);
  assert.equal((await apiWith(async () => reply([null, fixture()])).page()).items.length, 1);
  await assert.rejects(apiWith(async () => reply({ unexpected: true })).page(), isCode('INVALID_RESPONSE'));
  await assert.rejects(apiWith(async () => new Response('{')).page(), isCode('INVALID_RESPONSE'));
  for (const status of [401, 429, 500, 503]) await assert.rejects(apiWith(async () => reply({}, status)).page(), (err: unknown) => err instanceof ApiError && err.status === status);
  await assert.rejects(apiWith(async () => reply({}, 404)).event(uuid()), isCode('NOT_FOUND'));
  await assert.rejects(apiWith(async () => reply(fixture(2))).event(uuid()), isCode('INVALID_RESPONSE'));
  assert.equal((await apiWith(async () => reply(fixture())).event(uuid().toUpperCase())).id, uuid());
});
test('API timeouts and cancellation abort the underlying request', async () => {
  let cancelled = false;
  const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
    const abort = () => { cancelled = true; reject(new DOMException('Aborted', 'AbortError')); };
    if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener('abort', abort, { once: true });
  });
  await assert.rejects(apiWith(fetcher, 10).page(), isCode('TIMEOUT')); assert.equal(cancelled, true);
  cancelled = false; const controller = new AbortController(); const pending = apiWith(fetcher).page({}, 1, controller.signal); controller.abort();
  await assert.rejects(pending, { name: 'AbortError' }); assert.equal(cancelled, true);
});
test('a refreshed second page uses fresh first-page IDs after 20 newer events arrive', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let shifted = false;
  const api = { ...apiWith(async () => reply([])), page: async (_filters: unknown, n = 1) => shifted ? page(n, n === 1 ? 41 : 1) : page(n, n === 1 ? 1 : 21) };
  const observer = new InfiniteQueryObserver(client, eventQueryOptions({}, api));
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch(); await observer.fetchNextPage();
  shifted = true; const refreshed = await observer.refetch();
  assert.equal(refreshed.isError, false); assert.deepEqual(refreshed.data!.pages.map(p => p.items[0]!.id), [uuid(41), uuid(1)]);
  unsubscribe(); client.clear();
});
test('failed next page is retried at the same index and preserves loaded events', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let fail = true; const requests: number[] = [];
  const api = { ...apiWith(async () => reply([])), page: async (_filters: unknown, n = 1) => { requests.push(n); if(n === 2 && fail) throw new Error('offline'); return page(n, n === 1 ? 1 : 21, n === 1 ? 20 : 1); } };
  const observer = new InfiniteQueryObserver(client, eventQueryOptions({}, api)), unsubscribe = observer.subscribe(() => {});
  await observer.refetch(); const failed = await observer.fetchNextPage();
  assert.equal(failed.isFetchNextPageError, true); assert.equal(mergePages(failed.data?.pages).length, 20);
  fail = false; const success = await observer.fetchNextPage(); assert.equal(success.hasNextPage, false); assert.equal(mergePages(success.data?.pages).length, 21); assert.deepEqual(requests.slice(-2), [2, 2]);
  unsubscribe(); client.clear();
});
test('late older search response cannot overwrite the newer query', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let release!: () => void;
  const api = { ...apiWith(async () => reply([])), page: async (filters: { q?: string }) => { if (filters.q === 'old') await new Promise<void>(resolve => { release = resolve; }); return page(1, filters.q === 'old' ? 1 : 2, 1); } };
  const older = client.fetchInfiniteQuery(eventQueryOptions({ q: 'old' }, api));
  await client.fetchInfiniteQuery(eventQueryOptions({ q: 'new' }, api)); release(); await older;
  const current = client.getQueryData<{ pages: EventPage[] }>(['events', { q: 'new' }]); assert.equal(current?.pages[0]?.items[0]?.id, uuid(2)); client.clear();
});

test('Home retains cached rows on return/reconnect and changes only after a manual refresh', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let calls = 0, fail = false;
  const api = { ...apiWith(async () => reply([])), page: async () => { calls++; if(fail)throw new Error('offline'); return page(1, calls, 1); } };
  const options = homeEventsQueryOptions(api);
  client.mount();
  const observer = new QueryObserver(client, options); let unsubscribe = observer.subscribe(() => {});
  try {
    await observer.refetch({ cancelRefetch: false });
    assert.equal(calls, 1); assert.equal(observer.getCurrentResult().data?.[0]?.id, uuid(1));
    unsubscribe();
    // Even a cache explicitly marked stale must not refresh on screen return.
    await client.invalidateQueries({ queryKey: options.queryKey, refetchType: 'none' });
    unsubscribe = observer.subscribe(() => {});
    focusManager.setFocused(false); focusManager.setFocused(true);
    onlineManager.setOnline(false); onlineManager.setOnline(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(calls, 1); assert.equal(observer.getCurrentResult().data?.[0]?.id, uuid(1));
    const updated = await observer.refetch(); assert.equal(calls, 2); assert.equal(updated.data?.[0]?.id, uuid(2));
    fail = true; const failed = await observer.refetch();
    assert.equal(failed.isRefetchError, true); assert.equal(failed.data?.[0]?.id, uuid(2), 'A failed pull keeps the previous events');
  } finally { unsubscribe(); client.unmount(); client.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); }
});
test('preferences recover from corrupt storage and deduplicate saved IDs', () => {
  for (const raw of [null, '', '{bad', 'null', '[]']) assert.deepEqual(parsePreferences(raw, 'en'), { language: 'en', saved: [] });
  const value = parsePreferences(JSON.stringify({ language: 'xx', saved: [fixture(), fixture(), null, {}] }), 'ro');
  assert.equal(value.language, 'ro'); assert.equal(value.saved.length, 1);
});
test('preference writes remain ordered and recover after an earlier write fails', async () => {
  let release!: () => void; const order: string[] = [];
  const write = serializedWriter(async value => { if (value === 'first') { await new Promise<void>(resolve => { release = resolve; }); throw new Error('storage'); } order.push(value); });
  const first = write('first').catch(() => {}); const second = write('second'); const third = write('third');
  await new Promise(resolve => setTimeout(resolve, 0)); assert.deepEqual(order, []); release(); await Promise.all([first, second, third]); assert.deepEqual(order, ['second', 'third']);
});
