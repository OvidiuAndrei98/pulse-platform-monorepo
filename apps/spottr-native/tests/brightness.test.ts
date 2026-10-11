import test from 'node:test';
import assert from 'node:assert/strict';
import { BrightnessManager } from '../src/profile/brightness';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function device(initial = 0.37) {
  let value = initial, reads = 0;
  const writes: number[] = [];
  return { api: { get: async () => { reads++; return value; }, set: async (next: number) => { writes.push(next); value = next; } }, writes, value: () => value, reads: () => reads };
}

test('opening and closing a ticket restores its original screen brightness', async () => {
  const screen = device(), manager = new BrightnessManager(screen.api);
  await manager.acquire(); assert.equal(screen.value(), 1);
  await manager.release(); assert.equal(screen.value(), 0.37);
  assert.equal(screen.reads(), 1);
});

test('overlapping ticket leases retain full brightness until the final release', async () => {
  const screen = device(), manager = new BrightnessManager(screen.api);
  await manager.acquire(); await manager.acquire(); await manager.release();
  assert.equal(screen.value(), 1);
  assert.equal(screen.reads(), 1, 'a second ticket must not capture boosted brightness as the baseline');
  await manager.release(); assert.equal(screen.value(), 0.37);
  const writes = screen.writes.length;
  await manager.release(); assert.equal(screen.writes.length, writes);
});

test('backgrounding restores brightness and returning captures the current user setting', async () => {
  const screen = device(), manager = new BrightnessManager(screen.api);
  await manager.acquire(); await manager.setForeground(false);
  assert.equal(screen.value(), 0.37);
  await screen.api.set(0.62);
  await manager.setForeground(true); assert.equal(screen.value(), 1);
  await manager.release(); assert.equal(screen.value(), 0.62);
});

test('a ticket mounted in the background does not alter brightness', async () => {
  const screen = device(), manager = new BrightnessManager(screen.api);
  await manager.setForeground(false); await manager.acquire();
  assert.equal(screen.reads(), 0); assert.deepEqual(screen.writes, []);
  await manager.release(); await manager.setForeground(true);
  assert.equal(screen.reads(), 0); assert.deepEqual(screen.writes, []);
});

test('closing a ticket while its brightness read is pending cannot leave brightness boosted', async () => {
  const original = deferred<number>(), writes: number[] = [];
  const manager = new BrightnessManager({ get: () => original.promise, set: async value => { writes.push(value); } });
  const open = manager.acquire(); await flush();
  const close = manager.release(); original.resolve(0.23);
  await Promise.all([open, close]);
  assert.equal(writes.includes(1), false);
  assert.equal(writes.at(-1), 0.23);
});

test('closing while a boost is pending restores brightness after that write completes', async () => {
  const boost = deferred<void>(), screen = device(0.23);
  const manager = new BrightnessManager({ get: screen.api.get, set: async value => { if (value === 1) await boost.promise; await screen.api.set(value); } });
  const open = manager.acquire(); await flush();
  const close = manager.release(); boost.resolve();
  await Promise.all([open, close]);
  assert.deepEqual(screen.writes, [1, 0.23]);
});

test('a failed brightness read does not poison future foreground or cleanup operations', async () => {
  const screen = device(); let attempts = 0;
  const manager = new BrightnessManager({ get: async () => { if (++attempts === 1) throw new Error('unavailable'); return screen.api.get(); }, set: screen.api.set });
  await assert.rejects(manager.acquire(), /unavailable/);
  await manager.setForeground(true); assert.equal(screen.value(), 1);
  await manager.release(); assert.equal(screen.value(), 0.37);
});

test('a failed boost retains the captured brightness for release cleanup', async () => {
  const screen = device();
  const manager = new BrightnessManager({ get: screen.api.get, set: async value => { if (value === 1) throw new Error('boost rejected'); await screen.api.set(value); } });
  await assert.rejects(manager.acquire(), /boost rejected/);
  await manager.release(); assert.equal(screen.value(), 0.37);
  assert.deepEqual(screen.writes, [0.37]);
});

test('a failed restore can be retried without replacing its saved baseline', async () => {
  const screen = device(); let fail = true;
  const manager = new BrightnessManager({ get: screen.api.get, set: async value => { if (value !== 1 && fail) { fail = false; throw new Error('restore rejected'); } await screen.api.set(value); } });
  await manager.acquire(); await assert.rejects(manager.release(), /restore rejected/);
  await manager.setForeground(false);
  assert.equal(screen.value(), 0.37); assert.equal(screen.reads(), 1);
});
