const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hooks, modules, deferred, settle } = require('./helpers/qaHarness.cjs');

function view(load) {
  const hook = hooks();
  const loader = modules({ react: { ...hook.react, useSyncExternalStore: (_, snapshot) => snapshot() } });
  const cache = loader.load('lib/clientQueryCache');
  const { useEventPages } = loader.load('features/events/useEventPages');
  let key = 'first';
  const render = () => hook.render(() => {
    const capturedKey = key;
    return useEventPages(key, page => load(capturedKey, page), 2);
  });
  return { render, cache, setKey: value => { key = value; } };
}
const row = id => ({ id });

test('loads only page one until requested, coalesces repeated scroll triggers and retains visited pages on return', async () => {
  const calls = [], next = deferred();
  const v = view((key, page) => { calls.push([key, page]); return page === 1 ? Promise.resolve([row('a'),row('b')]) : next.promise; });
  v.render(); await settle();
  assert.equal(v.render().items.length, 2);
  assert.equal(calls.length, 1);
  const first = v.render().loadMore(), second = v.render().loadMore();
  await settle();
  assert.equal(calls.length, 2);
  next.resolve([row('c')]); await Promise.all([first,second]);
  assert.equal(v.render().hasMore, false);
  assert.deepEqual(Array.from(v.render().items, x=>x.id), ['a','b','c']);
  v.setKey(null); v.render(); v.setKey('first'); v.render(); await settle();
  assert.equal(v.render().items.length, 3);
  assert.equal(calls.length, 2);
});

test('a failed next page keeps visible results and retries the same page', async () => {
  let fail = true;
  const calls = [];
  const v = view(async (_, page) => { calls.push(page); if (page === 1) return [row('a'),row('b')]; if (fail) throw new Error('offline'); return [row('c')]; });
  v.render(); await settle(); await v.render().loadMore();
  assert.equal(v.render().items.length, 2);
  assert.ok(v.render().error);
  fail = false; await v.render().retry();
  assert.equal(v.render().error, null);
  assert.deepEqual(calls, [1,2,2]);
  assert.equal(v.render().items.length, 3);
});

test('late responses cannot overwrite a different search or repopulate a cleared session', async () => {
  const old = deferred();
  const v = view(async key => key === 'first' ? old.promise : [row('new')]);
  v.render(); await settle();
  v.setKey('second'); v.render(); await settle();
  assert.equal(v.render().items[0].id, 'new');
  v.cache.clearClientQueryCache();
  old.resolve([row('old')]); await settle();
  assert.equal(v.cache.readClientQuery('event-pages:first'), undefined);
});

test('overlapping pages deduplicate by ID, null ends pagination and ignored page parameters fail safely', async () => {
  const { appendEventPage } = modules().load('features/events/eventPages');
  const first = appendEventPage(undefined,[row('a'),row('b')],1,2);
  const second = appendEventPage(first,[row('b'),row('c')],2,2);
  assert.deepEqual(Array.from(second.items,x=>x.id),['a','b','c']);
  assert.equal(appendEventPage(second,null,3,2).hasMore,false);
  assert.throws(()=>appendEventPage(first,[row('a'),row('b')],2,2),/STALLED/);
  assert.throws(()=>appendEventPage(undefined,{},1,2),/INVALID/);
});
