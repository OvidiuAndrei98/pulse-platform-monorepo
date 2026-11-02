import test from 'node:test';
import assert from 'node:assert/strict';
import {EventFeedStore, parseFeedPage, parseLike, feedDate, type FeedEvent} from '../src/feed/model';
import {MAIN_TAB_DEFINITIONS, MAIN_TAB_NAMES, PROFILE_TAB_INDEX} from '../src/navigation/mainTabs';

const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const event = (n = 1): FeedEvent => ({id: id(n), organizerId: id(50), title: 'Night out', category: 'house', city: 'Bucuresti', locationName: 'Venue', description: '', startTime: '2099-01-01T20:00:00Z', endTime: '2099-01-02T04:00:00Z', externalTickets: false, likeCount: 5, liked: false});
function deferred<T>() {let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}

test('five tabs have distinct stable paths, Friends and Feed, and Profile is last', () => {
  assert.equal(MAIN_TAB_DEFINITIONS.length, 5); assert.equal(new Set(MAIN_TAB_DEFINITIONS.map(t => t.path)).size, 5);
  assert.deepEqual(MAIN_TAB_NAMES, ['Home', 'Explore', 'Friends', 'Feed', 'Profile']); assert.equal(PROFILE_TAB_INDEX, 4);
});
test('feed parser rejects impossible counts, partial items, malformed dates and pagination loops', () => {
  for (const likeCount of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => parseLike({likeCount, liked: false}));
  for (const items of [[{...event(), startTime: 'no'}], [{...event(), id: 'bad'}], [{...event(), externalTickets: 'yes'}], [event(), event()]]) assert.throws(() => parseFeedPage({items}, 1));
  assert.throws(() => parseFeedPage({items: [], nextPage: 1}, 1));
  assert.throws(() => parseFeedPage({items: [], nextPage: 501}, 500));
  assert.deepEqual(parseFeedPage({items: [event()], nextPage: 2}, 1).items, [event()]);
});
test('paging deduplicates repeated events and double loads share one request', async () => {
  const read = deferred<unknown>(); const calls: string[] = [];
  const store = new EventFeedStore(async path => {calls.push(path); return calls.length === 1 ? read.promise : {items: [event(), event(2)]};}, () => true);
  const first = store.load(); await store.load(); assert.equal(calls.length, 1);
  read.resolve({items: [event()], nextPage: 2}); await first; await store.load(true);
  assert.deepEqual(store.getSnapshot().items.map(e => e.id), [id(1), id(2)]); assert.equal(store.getSnapshot().nextPage, undefined);
});
test('like is explicit PUT, unlike DELETE, concurrent taps are ignored and counts come from server', async () => {
  const write = deferred<unknown>(); const calls: string[] = [];
  const store = new EventFeedStore(async (_, method) => {calls.push(method); return method === 'GET' ? {items: [event()]} : method === 'PUT' ? write.promise : {liked: false, likeCount: 20};}, () => true);
  await store.load(); const like = store.setLike(id(1), true); await store.setLike(id(1), true); await store.setLike(id(1), false);
  assert.equal(store.getSnapshot().items[0].likeCount, 6); assert.deepEqual(calls, ['GET', 'PUT']);
  write.resolve({liked: true, likeCount: 21}); await like; await store.setLike(id(1), false);
  assert.deepEqual(calls, ['GET', 'PUT', 'DELETE']); assert.equal(store.getSnapshot().items[0].likeCount, 20);
});
test('failed like restores the settled value, clears pending and can retry idempotently', async () => {
  let fail = true;
  const store = new EventFeedStore(async (_, method) => {if (method === 'GET') return {items: [event()]}; if (fail) throw Error('offline'); return {liked: true, likeCount: 6};}, () => true);
  await store.load(); await store.setLike(id(1), true);
  assert.equal(store.getSnapshot().items[0].liked, false); assert.equal(store.getSnapshot().items[0].likeCount, 5); assert.deepEqual(store.getSnapshot().working, []); assert.deepEqual(store.getSnapshot().likeErrors, [id(1)]);
  fail = false; await store.setLike(id(1), true); assert.equal(store.getSnapshot().items[0].liked, true); assert.deepEqual(store.getSnapshot().likeErrors, []);
});
test('an older feed read cannot overwrite a completed like', async () => {
  let reads = 0; const read = deferred<unknown>();
  const store = new EventFeedStore(async (_, method) => method === 'GET' ? ++reads === 1 ? {items: [event()]} : read.promise : {liked: true, likeCount: 6}, () => true);
  await store.load(); const pending = store.load(); await store.setLike(id(1), true); read.resolve({items: [event()]}); await pending;
  assert.equal(store.getSnapshot().items[0].liked, true); assert.equal(store.getSnapshot().items[0].likeCount, 6);
});
test('changing actor discards an in-flight read or like, without repopulating the new session', async () => {
  let current = true; const read = deferred<unknown>(); const store = new EventFeedStore(() => read.promise, () => current);
  const work = store.load(); current = false; read.resolve({items: [event()]}); await work; assert.equal(store.getSnapshot().items.length, 0);
  current = true; const write = deferred<unknown>(); const second = new EventFeedStore(async (_, method) => method === 'GET' ? {items: [event()]} : write.promise, () => current);
  await second.load(); const liking = second.setLike(id(1), true); const before = second.getSnapshot(); current = false; write.resolve({liked: true, likeCount: 900}); await liking; assert.equal(second.getSnapshot(), before);
});
test('dispose aborts requests and StrictMode reactivation can load again', async () => {
  let signal: AbortSignal | undefined; const read = deferred<unknown>(); let count = 0;
  const store = new EventFeedStore(async (_, __, abort) => {signal = abort; return ++count === 1 ? read.promise : {items: [event(2)]};}, () => true);
  const work = store.load(); store.dispose(); assert.equal(signal?.aborted, true); store.activate(); await store.load(); read.resolve({items: [event()]}); await work;
  assert.deepEqual(store.getSnapshot().items.map(e => e.id), [id(2)]);
});
test('pagination failure leaves current events usable and a deliberate retry loads the same next page', async () => {
  const calls: string[] = []; let fail = true;
  const store = new EventFeedStore(async path => {calls.push(path); if (path.endsWith('2') && fail) throw Error('offline'); return path.endsWith('1') ? {items: [event()], nextPage: 2} : {items: [event(2)]};}, () => true);
  await store.load(); await store.load(true); assert.equal(store.getSnapshot().error, true); assert.equal(store.getSnapshot().items.length, 1);
  fail = false; await store.load(true); assert.equal(store.getSnapshot().items.length, 2); assert.deepEqual(calls, ['/event-feed?page=1','/event-feed?page=2','/event-feed?page=2']);
});
test('feed event time is Romania time for every viewer', () => {assert.match(feedDate(event(), 'en'), /22:00/);});
