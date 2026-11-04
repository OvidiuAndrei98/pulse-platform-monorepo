import assert from 'node:assert/strict';
import test from 'node:test';
import { getTabCapsuleGeometry } from '../src/navigation/tabCapsuleGeometry';
import { advanceTabMotion, idleTabMotion, startTabMotion } from '../src/navigation/tabSynchronizedMotion';

const layout = getTabCapsuleGeometry(362, 5);

test('one phase publishes the whole bar, row and capsule and finishes without a delayed tail', () => {
  let state = startTabMotion(idleTabMotion(0, layout), 0, layout.limit, layout, 1000);
  for (const [x, now] of [[80, 1080], [160, 1160], [230, 1240], [265, 1320], [272, 1400]]) {
    state = advanceTabMotion(state, x!, layout, now!, 0, false, false);
    const unchanged = advanceTabMotion(state, x!, layout, now! + 4, 0, false, false);
    assert.equal(unchanged.phase, state.phase);
    assert.equal(unchanged.velocity, state.velocity);
    assert.deepEqual(unchanged.pose, state.pose, 'A metadata-only update cannot restart an impact or change its phase');
    assert.ok(state.pose.barScaleX >= 1 && state.pose.barScaleX <= 1.018);
  }
  state = advanceTabMotion(state, layout.limit, layout, 1500, 0, false, false);
  assert.equal(state.phase, 1);
  assert.equal(state.pose.barScaleX, 1); assert.equal(state.pose.barX, 0);
  assert.equal(state.pose.indicatorX, layout.limit);
  assert.equal(state.pose.indicatorScaleX, 1); assert.equal(state.pose.indicatorScaleY, 1);
  assert.deepEqual(advanceTabMotion(state, layout.limit, layout, 10000, 0, false, false).pose, state.pose);
});

test('interruptions capture the exact displayed matrices instead of restarting the effects', () => {
  let state = startTabMotion(idleTabMotion(0, layout), 0, layout.limit, layout, 1000);
  for (const [x, now] of [[120, 1100], [220, 1200], [265, 1300], [layout.limit + 1, 1400]]) state = advanceTabMotion(state, x!, layout, now!, 0, false, false);
  assert.ok(state.pose.barScaleX > 1);
  const before = state.pose;
  state = startTabMotion(state, state.x, 0, layout, 1401);
  assert.deepEqual(state.pose, before);
  const first = advanceTabMotion(state, state.x, layout, 1402, 0, false, false);
  assert.deepEqual(first.pose, before, 'There is no jump on the first frame of a reversal');
  state = advanceTabMotion(first, 200, layout, 1470, 0, false, false);
  const latest = startTabMotion(state, state.x, layout.spacing * 2, layout, 1471);
  assert.deepEqual(latest.pose, state.pose);
  assert.equal(latest.target, layout.spacing * 2);
});

test('a held pickup uses existing resistance and a reduced-motion or resized frame has no elastic effects', () => {
  let state = idleTabMotion(0, layout);
  state = advanceTabMotion(state, -5, layout, 1100, 1, true, false);
  assert.ok(state.pose.barX < 0 && state.pose.barScaleX > 1);
  assert.equal(state.pose.barScaleX * state.pose.trackScaleX, 1);
  assert.ok(Math.abs(state.pose.barX + state.pose.barScaleX * state.pose.trackX) < 1e-9);
  const release = startTabMotion(state, -5, 0, layout, 1101);
  assert.deepEqual(release.pose, state.pose);
  const reduced = advanceTabMotion(release, 0, layout, 1200, 0, false, true);
  assert.equal(reduced.pose.barScaleX, 1); assert.equal(reduced.pose.indicatorX, 0);
  const resized = advanceTabMotion(state, 0, getTabCapsuleGeometry(344, 5), 1200, 0, false, false);
  assert.equal(resized.pose.barScaleX, 1); assert.equal(resized.pose.indicatorScaleX, 1);
});

test('a stationary grip release keeps the displayed scale until its existing interaction spring releases', () => {
  let state = advanceTabMotion(idleTabMotion(0, layout), 0, layout, 1000, 1, true, false);
  const held = state.pose;
  state = startTabMotion(state, 0, 0, layout, 1001);
  assert.deepEqual(state.pose, held);
  state = advanceTabMotion(state, 0, layout, 1002, 1, false, false);
  assert.equal(state.pose.indicatorScaleX, held.indicatorScaleX);
  assert.equal(state.pose.indicatorScaleY, held.indicatorScaleY);
  state = advanceTabMotion(state, 0, layout, 1100, 0, false, false);
  assert.equal(state.pose.indicatorScaleX, 1); assert.equal(state.pose.indicatorScaleY, 1);
});

test('contact is the position spring pressing the surface, with no independently phased displacement', () => {
  for (const side of [-1, 1]) {
    const target = side < 0 ? 0 : layout.limit;
    const start = side < 0 ? layout.limit : 0;
    let state = startTabMotion(idleTabMotion(start, layout), start, target, layout, 1000);
    let now = 1000;
    const sample = (x: number) => {
      now += 20; state = advanceTabMotion(state, x, layout, now, 0, false, false);
      const p = state.pose;
      const screenX = layout.width / 2 + p.barX + p.barScaleX * (layout.firstCenter + p.indicatorX - layout.width / 2);
      const excess = Math.max(0, -x, x - layout.limit);
      const expectedX = excess ? target + side * excess / (1 + excess / 6) : x;
      assert.ok(Math.abs(screenX - (layout.firstCenter + expectedX)) < 1e-9, 'The entire visible center follows the same spring, including the surface transform');
      if (!excess) { assert.equal(p.barScaleX, 1); assert.equal(p.barX, 0); }
      return p;
    };
    for (const portion of [.3,.7,.95,.999]) sample(start + (target - start) * portion);
    const contact = sample(target + side * 1.5);
    assert.ok(contact.barScaleX > 1 && contact.barScaleX < 1.006);
    const returning = sample(target + side * .5);
    assert.ok(returning.barScaleX < contact.barScaleX, 'The glass returns exactly as the same position returns');
    sample(target);
  }
});
