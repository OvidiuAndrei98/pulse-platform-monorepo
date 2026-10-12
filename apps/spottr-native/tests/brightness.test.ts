import test from 'node:test';
import assert from 'node:assert/strict';
import { BrightnessManager } from '../src/profile/brightness';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function automaticClock() {
  let time = 0;
  return { now: () => time, schedule: (callback: () => void, delay: number) => {
    let active = true;
    queueMicrotask(() => { if (active) { time += delay; callback(); } });
    return () => { active = false; };
  } };
}
function controlledClock() {
  let time = 0;
  const pending = new Set<() => void>();
  const step = async (ms = 16) => {
    time += ms;
    for (const callback of [...pending]) { pending.delete(callback); callback(); }
    await flush();
  };
  return {
    api: { now: () => time, schedule: (callback: () => void) => { pending.add(callback); return () => { pending.delete(callback); }; } },
    pending: () => pending.size,
    step,
    finish: async () => { await flush(); for (let i = 0; pending.size && i < 100; i++) await step(); assert.equal(pending.size, 0, 'Brightness transition must finish'); },
  };
}
function device(initial = 0.37) {
  let value = initial, reads = 0;
  const writes: number[] = [];
  return { api: { get: async () => { reads++; return value; }, set: async (next: number) => { writes.push(next); value = next; } }, writes, value: () => value, reads: () => reads };
}

test('the production clock initializes and animates without an injected test clock', async () => {
  const screen = device(), manager = new BrightnessManager(screen.api);
  await manager.acquire(); assert.equal(screen.value(), 1);
  await manager.release(); assert.equal(screen.value(), 0.37);
  assert.ok(screen.writes.some(value => value > 0.37 && value < 1));
});

test('opening and closing a ticket restores its original screen brightness', async () => {
  const screen = device(), manager = new BrightnessManager(screen.api, automaticClock());
  await manager.acquire(); assert.equal(screen.value(), 1);
  await manager.release(); assert.equal(screen.value(), 0.37);
  assert.equal(screen.reads(), 1);
});

test('overlapping ticket leases retain full brightness until the final release', async () => {
  const screen = device(), manager = new BrightnessManager(screen.api, automaticClock());
  await manager.acquire(); await manager.acquire(); await manager.release();
  assert.equal(screen.value(), 1);
  assert.equal(screen.reads(), 1, 'a second ticket must not capture boosted brightness as the baseline');
  await manager.release(); assert.equal(screen.value(), 0.37);
  const writes = screen.writes.length;
  await manager.release(); assert.equal(screen.writes.length, writes);
});

test('backgrounding restores brightness and returning captures the current user setting', async () => {
  const screen = device(), manager = new BrightnessManager(screen.api, automaticClock());
  await manager.acquire(); await manager.setForeground(false);
  assert.equal(screen.value(), 0.37);
  await screen.api.set(0.62);
  await manager.setForeground(true); assert.equal(screen.value(), 1);
  await manager.release(); assert.equal(screen.value(), 0.62);
});

test('a ticket mounted in the background does not alter brightness', async () => {
  const screen = device(), manager = new BrightnessManager(screen.api, automaticClock());
  await manager.setForeground(false); await manager.acquire();
  assert.equal(screen.reads(), 0); assert.deepEqual(screen.writes, []);
  await manager.release(); await manager.setForeground(true);
  assert.equal(screen.reads(), 0); assert.deepEqual(screen.writes, []);
});

test('closing a ticket while its brightness read is pending cannot leave brightness boosted', async () => {
  const original = deferred<number>(), writes: number[] = [];
  const manager = new BrightnessManager({ get: () => original.promise, set: async value => { writes.push(value); } }, automaticClock());
  const open = manager.acquire(); await flush();
  const close = manager.release(); original.resolve(0.23);
  await Promise.all([open, close]);
  assert.equal(writes.includes(1), false);
  assert.equal(writes.at(-1), 0.23);
});

test('closing while a boost is pending restores brightness after that write completes', async () => {
  const boost = deferred<void>(), screen = device(0.23);
  const manager = new BrightnessManager({ get: screen.api.get, set: async value => { if (value === 1) await boost.promise; await screen.api.set(value); } }, automaticClock());
  const open = manager.acquire(); await flush();
  const beforeRelease = screen.writes.length;
  const close = manager.release(); boost.resolve();
  await Promise.all([open, close]);
  assert.equal(screen.writes[beforeRelease], 1, 'The pending native write finishes before restoration');
  assert.equal(screen.writes.at(-1), 0.23);
  assert.ok(screen.writes.slice(beforeRelease + 1).every((value, index, values) => value < (values[index - 1] ?? 1)));
});

test('a failed brightness read does not poison future foreground or cleanup operations', async () => {
  const screen = device(); let attempts = 0;
  const manager = new BrightnessManager({ get: async () => { if (++attempts === 1) throw new Error('unavailable'); return screen.api.get(); }, set: screen.api.set }, automaticClock());
  await assert.rejects(manager.acquire(), /unavailable/);
  await manager.setForeground(true); assert.equal(screen.value(), 1);
  await manager.release(); assert.equal(screen.value(), 0.37);
});

test('a failed boost retains the captured brightness for release cleanup', async () => {
  const screen = device();
  const manager = new BrightnessManager({ get: screen.api.get, set: async value => { if (value === 1) throw new Error('boost rejected'); await screen.api.set(value); } }, automaticClock());
  await assert.rejects(manager.acquire(), /boost rejected/);
  await manager.release(); assert.equal(screen.value(), 0.37);
  assert.equal(screen.writes.includes(1), false);
  assert.equal(screen.writes.at(-1), 0.37);
});

test('a failed restore can be retried without replacing its saved baseline', async () => {
  const screen = device(); let fail = true;
  const manager = new BrightnessManager({ get: screen.api.get, set: async value => { if (value !== 1 && fail) { fail = false; throw new Error('restore rejected'); } await screen.api.set(value); } }, automaticClock());
  fail = false; await manager.acquire(); fail = true;
  await assert.rejects(manager.release(), /restore rejected/);
  await manager.setForeground(false);
  assert.equal(screen.value(), 0.37); assert.equal(screen.reads(), 1);
});

test('brightness eases through intermediate levels in both directions and restores exactly', async () => {
  const screen = device(0.2), time = controlledClock(), manager = new BrightnessManager(screen.api, time.api);
  const open = manager.acquire(); await flush();
  assert.deepEqual(screen.writes, [], 'Opening must not immediately jump to maximum');
  await time.step(35); const first = screen.value();
  await time.step(140); const middle = screen.value();
  assert.ok(first > 0.2 && first < 0.3);
  assert.ok(Math.abs(middle - 0.6) < 0.001, 'Halfway through the fade is halfway between brightness levels');
  await time.finish(); await open;
  assert.equal(screen.value(), 1);
  const count = screen.writes.length, close = manager.release(); await flush();
  assert.equal(screen.value(), 1, 'Closing must not jump to the baseline');
  await time.step(175); assert.ok(Math.abs(screen.value() - 0.6) < 0.001);
  await time.finish(); await close;
  assert.equal(screen.value(), 0.2);
  assert.ok(screen.writes.slice(0, count).every((value, index, values) => value > (values[index - 1] ?? 0.2)));
  assert.ok(screen.writes.slice(count).every((value, index, values) => value < (values[index - 1] ?? 1)));
});

test('closing partway through the fade reverses from the current level without flashing maximum', async () => {
  const screen = device(), time = controlledClock(), manager = new BrightnessManager(screen.api, time.api);
  const open = manager.acquire(); await flush(); await time.step(100);
  const middle = screen.value(), count = screen.writes.length;
  const close = manager.release(); await flush(); await time.step();
  assert.ok(screen.value() < middle && screen.value() > 0.37);
  await time.finish(); await Promise.all([open, close]);
  assert.equal(screen.value(), 0.37);
  assert.equal(screen.writes.includes(1), false);
  assert.ok(screen.writes.slice(count).every(value => value < middle));
  assert.equal(screen.reads(), 1);
});

test('reopening during restoration retains the original baseline and reverses smoothly', async () => {
  const screen = device(), time = controlledClock(), manager = new BrightnessManager(screen.api, time.api);
  const open = manager.acquire(); await time.finish(); await open;
  const close = manager.release(); await flush(); await time.step(100);
  const middle = screen.value(), reopen = manager.acquire(); await flush(); await time.step();
  assert.ok(screen.value() > middle && screen.value() < 1);
  await time.finish(); await Promise.all([close, reopen]);
  assert.equal(screen.value(), 1);
  const finalClose = manager.release(); await time.finish(); await finalClose;
  assert.equal(screen.value(), 0.37);
  assert.equal(screen.reads(), 1, 'A partially restored brightness is never captured as the new baseline');
});

test('backgrounding interrupts both fade directions without waiting for another timer', async () => {
  for (const direction of ['opening', 'closing']) {
    const screen = device(), time = controlledClock(), manager = new BrightnessManager(screen.api, time.api);
    const open = manager.acquire();
    let transition = open;
    if (direction === 'closing') { await time.finish(); await open; transition = manager.release(); }
    await flush(); await time.step(100);
    const background = manager.setForeground(false);
    // Intentionally do not advance the fake timers: JS may be suspended now.
    await Promise.all([transition, background]);
    assert.equal(screen.value(), 0.37);
    assert.equal(time.pending(), 0);
    const count = screen.writes.length; await time.step(1000);
    assert.equal(screen.writes.length, count, 'Cancelled frames cannot boost the background screen');
  }
});

test('slow native writes stay serialized when a transition is interrupted', async () => {
  const screen = device(), time = controlledClock(), firstWrite = deferred<void>();
  let calls = 0, pending = 0, maxPending = 0;
  const manager = new BrightnessManager({ get: screen.api.get, set: async value => {
    pending++; maxPending = Math.max(maxPending, pending);
    if (++calls === 1) await firstWrite.promise;
    await screen.api.set(value); pending--;
  } }, time.api);
  const open = manager.acquire(); await flush(); await time.step();
  const close = manager.release(); await flush(); await time.step(500);
  assert.equal(calls, 1, 'Do not queue brightness writes behind a slow native call');
  firstWrite.resolve(); await time.finish(); await Promise.all([open, close]);
  assert.equal(maxPending, 1); assert.equal(screen.value(), 0.37);
});

test('brightness boundaries stay exact and invalid native readings never reach the setter', async () => {
  for (const initial of [0, 1, 0.999]) {
    const screen = device(initial), manager = new BrightnessManager(screen.api, automaticClock());
    await manager.acquire(); await manager.release();
    assert.equal(screen.value(), initial);
    assert.ok(screen.writes.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  }
  for (const initial of [NaN, Infinity, -0.1, 1.1]) {
    const screen = device(initial), manager = new BrightnessManager(screen.api, automaticClock());
    await assert.rejects(manager.acquire(), /Invalid screen brightness/);
    await manager.release(); assert.deepEqual(screen.writes, []);
  }
});
