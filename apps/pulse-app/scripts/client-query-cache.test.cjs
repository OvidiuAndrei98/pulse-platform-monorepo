const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function cache() {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/clientQueryCache.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports });
  return exports;
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('warm query and empty results stay visible while revalidating', async () => {
  const c = cache();
  const data = [];
  await c.refreshClientQuery('user:events', async () => data);
  const next = deferred();
  const request = c.refreshClientQuery('user:events', () => next.promise);
  assert.equal(c.readClientQuery('user:events').hasData, true);
  assert.equal(c.readClientQuery('user:events').data, data);
  assert.equal(c.readClientQuery('user:events').refreshing, true);
  const fresh = ['new event'];
  next.resolve(fresh);
  await request;
  assert.equal(c.readClientQuery('user:events').data, fresh);
});

test('concurrent requests deduplicate and notify active subscribers', async () => {
  const c = cache();
  const next = deferred();
  let calls = 0, notifications = 0;
  const unsubscribe = c.subscribeClientQuery('same', () => notifications++);
  const one = c.refreshClientQuery('same', () => { calls++; return next.promise; });
  const two = c.refreshClientQuery('same', async () => { calls++; return ['wrong']; });
  assert.equal(one, two);
  next.resolve(['right']);
  await one;
  assert.equal(calls, 1);
  assert.equal(notifications, 2);
  unsubscribe();
});

test('failed background refresh retains data and can recover', async () => {
  const c = cache();
  await c.refreshClientQuery('profile', async () => ['ticket']);
  const error = new Error('offline');
  await c.refreshClientQuery('profile', async () => { throw error; });
  assert.equal(c.readClientQuery('profile').hasData, true);
  assert.equal(c.readClientQuery('profile').data[0], 'ticket');
  assert.equal(c.readClientQuery('profile').error, error);
  await c.refreshClientQuery('profile', async () => ['fresh']);
  assert.equal(c.readClientQuery('profile').error, null);
});

test('returning to a failed tab retains its error while retrying, then recovers', async () => {
  const c = cache();
  const error = new Error('offline');
  await c.refreshClientQuery('feed', async () => { throw error; });
  const next = deferred();
  const request = c.refreshClientQuery('feed', () => next.promise);
  const retrying = c.readClientQuery('feed');
  assert.equal(retrying.hasData, false);
  assert.equal(retrying.refreshing, true);
  // useCachedClientQuery must not replace this known state with a full skeleton.
  assert.equal(retrying.error, error);
  next.resolve([]);
  await request;
  assert.equal(c.readClientQuery('feed').error, null);
  assert.equal(c.readClientQuery('feed').hasData, true);
});

test('logout rejects late responses even if the same account signs in again', async () => {
  const c = cache();
  const old = deferred();
  const request = c.refreshClientQuery('same-user', () => old.promise);
  c.clearClientQueryCache();
  await c.refreshClientQuery('same-user', async () => ['new session']);
  old.resolve(['old session']);
  await request;
  assert.equal(c.readClientQuery('same-user').data[0], 'new session');
});

test('account and filter keys remain independent', async () => {
  const c = cache();
  await c.refreshClientQuery('alice:rock', async () => ['rock']);
  await c.refreshClientQuery('bob:pop', async () => ['pop']);
  assert.equal(c.readClientQuery('bob:rock'), undefined);
  assert.equal(c.readClientQuery('alice:pop'), undefined);
});

test('a successful mutation cannot be overwritten by an older refresh', async () => {
  const c = cache();
  await c.refreshClientQuery('requests', async () => ['accepted', 'remaining']);
  const old = deferred();
  const request = c.refreshClientQuery('requests', () => old.promise);
  c.updateClientQuery('requests', data => data.filter(id => id !== 'accepted'));
  old.resolve(['accepted', 'remaining']);
  await request;
  assert.deepEqual(c.readClientQuery('requests').data, ['remaining']);
});

test('unmounted queries are bounded while actively viewed data remains cached', async () => {
  const c = cache();
  const unsubscribe = c.subscribeClientQuery('active', () => {});
  await c.refreshClientQuery('active', async () => ['visible']);
  for (let i = 0; i < 90; i++) await c.refreshClientQuery('filter:' + i, async () => []);
  assert.equal(c.readClientQuery('filter:0'), undefined);
  assert.equal(c.readClientQuery('active').data[0], 'visible');
  unsubscribe();
});

test('fresh queries honor their TTL while an explicit refresh bypasses it', async () => {
  const c = cache();
  let calls = 0;
  const load = async () => [++calls];
  await c.refreshClientQuery('ttl', load, { staleTimeMs: 60_000 });
  await c.refreshClientQuery('ttl', load, { staleTimeMs: 60_000 });
  assert.equal(calls, 1);
  await c.refreshClientQuery('ttl', load, { staleTimeMs: 60_000, force: true });
  assert.equal(calls, 2);
  assert.equal(c.readClientQuery('ttl').data[0], 2);
});

test('imperative readers reuse the same cached query and stale data survives refresh failure', async () => {
  const c = cache();
  let calls = 0;
  const first = await c.getClientQuery('profile', async () => ({ name: `user-${++calls}` }), 60_000);
  const second = await c.getClientQuery('profile', async () => ({ name: `user-${++calls}` }), 60_000);
  assert.equal(first, second);
  assert.equal(calls, 1);
  await c.refreshClientQuery('profile', async () => { throw new Error('offline'); }, { force: true });
  const stale = await c.getClientQuery('profile', async () => { throw new Error('offline'); }, 60_000);
  assert.equal(stale.name, 'user-1');
});

test('one mutation can update every matching display query without touching other keys', async () => {
  const c = cache();
  await c.refreshClientQuery('events:guest', async () => [{ id: 'event', saved: false }]);
  await c.refreshClientQuery('events:user', async () => [{ id: 'event', saved: false }]);
  await c.refreshClientQuery('friends:user', async () => [{ id: 'friend' }]);
  c.updateClientQueries(
    key => key.startsWith('events:'),
    rows => rows.map(row => ({ ...row, saved: true })),
  );
  assert.equal(c.readClientQuery('events:guest').data[0].saved, true);
  assert.equal(c.readClientQuery('events:user').data[0].saved, true);
  assert.equal(c.readClientQuery('friends:user').data[0].saved, undefined);
});
