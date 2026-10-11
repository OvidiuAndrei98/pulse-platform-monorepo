import assert from 'node:assert/strict';
import test from 'node:test';
import { REFRESH_PULL_THRESHOLD, refreshPullIntent, refreshPullOffset } from '../src/ui/refreshGesture';

test('refresh claims only a deliberate downward vertical pull', () => {
  assert.equal(refreshPullIntent(3, 7), 'pending');
  assert.equal(refreshPullIntent(4, 12), 'pull');
  assert.equal(refreshPullIntent(20, 10), 'scroll');
  assert.equal(refreshPullIntent(-20, 10), 'scroll');
  assert.equal(refreshPullIntent(0, -10), 'scroll');
  assert.equal(refreshPullIntent(10, 10), 'scroll');
});

test('pull feedback is resisted and bounded without changing its release threshold', () => {
  assert.equal(refreshPullOffset(-10), 0);
  assert.equal(refreshPullOffset(0), 0);
  assert.equal(refreshPullOffset(25), 11.25);
  assert.equal(refreshPullOffset(REFRESH_PULL_THRESHOLD), 43.2);
  assert.equal(refreshPullOffset(210), 72);
  assert.equal(refreshPullOffset(10_000), 72);
  assert.ok(25 < REFRESH_PULL_THRESHOLD && 210 > REFRESH_PULL_THRESHOLD);
});
