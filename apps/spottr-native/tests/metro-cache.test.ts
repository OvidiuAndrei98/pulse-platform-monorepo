import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import test from 'node:test';

const { limitCacheIO } = require('../scripts/metro-cache.cjs');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('Metro bounds simultaneous reads and writes across cache stores without losing values', async () => {
  let active = 0, peak = 0;
  const data = new Map<number, unknown>();
  const context = new AsyncLocalStorage<number>();
  async function io(key: number, result: unknown) {
    assert.equal(context.getStore(), key, 'Queued requests retain their Expo async context');
    peak = Math.max(peak, ++active);
    await delay(1);
    active--;
    return result;
  }
  const store = {
    get(key: number) { return io(key, data.get(key) ?? null); },
    async set(key: number, value: unknown) { await io(key, undefined); data.set(key, value); },
    clear() { data.clear(); },
  };
  const stores = limitCacheIO([store, store]);
  await Promise.all(Array.from({ length: 1200 }, (_, key) => context.run(key, async () => {
    const cache = stores[key % stores.length], value = { code: `module-${key}` };
    assert.equal(await cache.get(key), null);
    await cache.set(key, value);
    assert.equal(await cache.get(key), value);
  })));
  assert.equal(peak, 32);
  assert.equal(active, 0);
  assert.equal(data.size, 1200);
  stores[0].clear();
  assert.equal(data.size, 0, 'Cache reset is preserved');
});

test('descriptor pressure is retried for reads and writes without turning it into a cache miss', async () => {
  for (const code of ['EMFILE', 'ENFILE']) for (const method of ['get', 'set']) {
    let calls = 0;
    const value = { code: 'cached module' };
    const store = { [method]() { if (++calls < 3) throw Object.assign(Error(code), { code }); return value; } };
    const [cache] = limitCacheIO([store]);
    assert.equal(await cache[method](Buffer.from('key'), value), value);
    assert.equal(calls, 3);
  }
});

test('failed operations release their slot and preserve the original error', async () => {
  for (const code of ['EACCES', 'EMFILE']) {
    let calls = 0;
    const failure = Object.assign(Error(code), { code });
    const [cache] = limitCacheIO([{ get(key: string) {
      if (key === 'bad') { calls++; throw failure; }
      return 'next module';
    } }], 1);
    const [failed, next] = await Promise.allSettled([cache.get('bad'), cache.get('good')]);
    assert.equal(failed.status, 'rejected');
    if (failed.status === 'rejected') assert.equal(failed.reason, failure);
    assert.deepEqual(next, { status: 'fulfilled', value: 'next module' });
    assert.equal(calls, code === 'EMFILE' ? 4 : 1, 'Retries are bounded and restricted to descriptor errors');
  }
});
