import assert from 'node:assert/strict';
import test from 'node:test';
import { createHapticFeedback } from '../src/ui/hapticFeedback';

test('rapid input does not queue a burst of haptics', () => {
  let time = 0, calls = 0;
  const feedback = createHapticFeedback({ selection: async () => { calls++; } }, () => time);
  feedback('selection'); feedback('selection'); time = 79; feedback('selection');
  assert.equal(calls, 1);
  time = 80; feedback('selection'); assert.equal(calls, 2);
});

test('unavailable native haptics never rejects the user action', async () => {
  let time = 0;
  const feedback = createHapticFeedback({
    sync: () => { throw Error('Native module unavailable'); },
    async: () => Promise.reject(Error('Unsupported device')),
  }, () => time += 100);
  assert.doesNotThrow(() => feedback('sync'));
  assert.doesNotThrow(() => feedback('async'));
  await new Promise(resolve => setImmediate(resolve));
});
