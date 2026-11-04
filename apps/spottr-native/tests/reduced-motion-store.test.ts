import assert from 'node:assert/strict';
import test from 'node:test';
import { createReducedMotionStore } from '../src/ui/reducedMotionStore';

test('hundreds of mounted controls share one native read and listener, including later mounts', async () => {
  let reads = 0, listens = 0, removes = 0, notifications = 0;
  let change!: (value: boolean) => void;
  const store = createReducedMotionStore({
    read: async () => { reads++; return false; },
    listen: callback => { listens++; change = callback; return () => removes++; },
  });
  store.initialize(false);
  const unsubscribe = Array.from({ length: 250 }, () => store.subscribe(() => notifications++));
  await Promise.resolve();
  assert.equal(reads, 1); assert.equal(listens, 1);
  change(true);
  assert.equal(notifications, 250); assert.equal(store.getSnapshot(), true);
  store.initialize(false);
  assert.equal(store.getSnapshot(), true, 'a newly mounted button cannot restore the old startup snapshot');
  unsubscribe.slice(0, 249).forEach(remove => remove());
  assert.equal(removes, 0);
  unsubscribe[249]!(); assert.equal(removes, 1);
});

test('unmounting invalidates a pending read and events from the previous subscription', async () => {
  const reads: ((value: boolean) => void)[] = [], changes: ((value: boolean) => void)[] = [];
  const store = createReducedMotionStore({
    read: () => new Promise(resolve => reads.push(resolve)),
    listen: callback => { changes.push(callback); return () => {}; },
  });
  store.initialize(false);
  store.subscribe(() => {})();
  const stop = store.subscribe(() => {});
  changes[0]!(true); reads[0]!(true); await Promise.resolve();
  assert.equal(store.getSnapshot(), false);
  changes[1]!(true); reads[1]!(false); await Promise.resolve();
  assert.equal(store.getSnapshot(), true);
  stop();
});
