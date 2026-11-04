import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
const { hooks, modules } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

test('event rows track only consumed query properties and retain pagination guards', () => {
  const h = hooks(), reads = new Set<string>(); let fetches = 0;
  const result = { data: { pages: [{ items: ['event-a'] }] }, isPending: false, isFetching: false,
    hasNextPage: true, isFetchNextPageError: false, isStale: false,
    fetchNextPage: (options: { cancelRefetch: boolean }) => { assert.equal(options.cancelRefetch, false); fetches++; } };
  const query = new Proxy(result, { get(target, key) { reads.add(String(key)); return Reflect.get(target, key); } });
  const { useEvents } = modules({
    react: h.react,
    '@tanstack/react-query': { QueryClient: class {}, infiniteQueryOptions: (options: unknown) => options, useInfiniteQuery: () => query },
    './api': { eventsApi: {}, ApiError: class extends Error {} },
    './events': { mergePages: (pages: { items: string[] }[] = []) => pages.flatMap(page => page.items) },
  }).load(path.resolve(__dirname, '../src/data/queries.ts'));
  const events = h.render(() => useEvents({}, false));
  assert.deepEqual([...reads], ['data'], 'constructing the hook result must not subscribe the page to every fetch/stale flag');
  assert.deepEqual(Array.from(events.items), ['event-a']);
  void events.query.isPending;
  assert.equal(reads.has('isFetching'), false); assert.equal(reads.has('isStale'), false);
  events.loadMore(); assert.equal(fetches, 1);
  result.isFetching = true; events.loadMore(); assert.equal(fetches, 1);
  result.isFetching = false; result.isFetchNextPageError = true;
  events.loadMore(); assert.equal(fetches, 1, 'scrolling must not loop over a failed page');
  h.unmount();
});
