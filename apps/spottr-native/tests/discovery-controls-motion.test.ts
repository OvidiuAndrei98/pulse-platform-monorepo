import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceDiscoveryControls, initialDiscoveryControlsState } from '../src/screens/discoveryControlsMotion';
import { initialSearchBounds, iosSearchCloseSpring, searchMorphGeometry } from '../src/screens/searchMorph';

function fixture(width = 350) {
  const bounds = initialSearchBounds(width);
  let state = initialDiscoveryControlsState(false);
  const frame = (progress: number, opening: boolean, interactive = false, reduced = false) => {
    const geometry = searchMorphGeometry(bounds, progress, 144, { ios: true, opening, interactive, reduced });
    state = advanceDiscoveryControls(state, { progress, opening, interactive, reduced, sourceX: bounds.source.x,
      opacity: geometry.controls, scale: geometry.controlsScale, y: geometry.controlsTranslateY });
    return { ...state, geometry };
  };
  return { frame, bounds };
}
const { mass, stiffness, damping } = iosSearchCloseSpring;
const alpha = damping / (2 * mass), frequency = Math.sqrt(stiffness / mass - alpha * alpha);
const progressAt = (ms: number) => {
  const t = ms / 1000;
  return Math.exp(-alpha * t) * (Math.cos(frequency * t) + alpha / frequency * Math.sin(frequency * t));
};
const near = (a: number, b: number, message?: string) => assert.ok(Math.abs(a - b) < 1e-9, message ?? `${a} != ${b}`);

test('normal opening is visually identical to scaling the original common container', () => {
  for (const width of [240, 280, 350, 728]) {
    const f = fixture(width), source = f.bounds.source.x, groupCenter = (source - 8) / 2;
    const switchCenter = (source - 60) / 2, filterCenter = source - 30;
    f.frame(0, false);
    for (const p of [.02, .1, .2, .3, .39, .4, .5, .8, 1, 1.015, 1]) {
      const frame = f.frame(p, true), oldScale = frame.geometry.controlsScale;
      near(frame.switch.scale, oldScale); near(frame.filter.scale, oldScale);
      near(switchCenter + frame.switch.x, groupCenter + (switchCenter - groupCenter) * oldScale);
      near(filterCenter + frame.filter.x, groupCenter + (filterCenter - groupCenter) * oldScale);
      near(frame.switch.opacity, frame.geometry.controls); near(frame.filter.opacity, frame.geometry.controls);
      near(frame.switch.y, frame.geometry.controlsTranslateY); near(frame.filter.y, frame.geometry.controlsTranslateY);
    }
  }
});

test('return uses staggered opacity and restrained, coordinated settling within the existing spring', () => {
  const f = fixture(); f.frame(1, true);
  const frames = Array.from({ length: 501 }, (_, ms) => f.frame(progressAt(ms), false));
  const switchStart = frames.findIndex(frame => frame.switch.opacity > 0);
  const filterStart = frames.findIndex(frame => frame.filter.opacity > 0);
  const switchEnd = frames.findIndex(frame => frame.switch.opacity === 1);
  assert.ok(filterStart - switchStart >= 20 && filterStart - switchStart <= 30);
  assert.ok(switchEnd - switchStart >= 160 && switchEnd - switchStart <= 190);
  near(Math.max(...frames.map(frame => frame.switch.scale)), 1.015);
  near(Math.max(...frames.map(frame => frame.filter.scale)), 1.025);
  assert.ok(frames.findIndex(frame => frame.filter.scale === 1.025) < frames.findIndex(frame => frame.switch.scale === 1.015), 'Filter reaches its smaller, quicker spring landing first');
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!, b = frames[i]!;
    for (const key of ['switch', 'filter'] as const) {
      assert.ok(b[key].opacity >= a[key].opacity, 'Opacity never reverses during the terminal spring');
      assert.ok(b[key].opacity - a[key].opacity < .025, 'No sudden visibility handoff');
    }
    if (b.switch.opacity || b.filter.opacity) near(b.geometry.back, 0, 'Back disappears before the returning glass');
    assert.ok(b.switch.y >= 0 && b.switch.y <= 5);
    if (b.filter.opacity > 0) assert.ok(b.filter.y >= 0 && b.filter.y <= 3);
  }
  const end = f.frame(0, false);
  assert.deepEqual(end.switch, { opacity: 1, scale: 1, x: 0, y: 0 });
  assert.deepEqual(end.filter, { opacity: 1, scale: 1, x: 0, y: 0 });
  near(end.geometry.searchWidth, 44); near(end.geometry.searchX, f.bounds.source.x);
});

test('rapid reversals carry the visible poses rather than switching animation curves abruptly', () => {
  const f = fixture(); f.frame(1, true);
  for (const p of [.8, .5, .35, .2, .1, .015, -.005]) {
    const closing = f.frame(p, false), reversed = f.frame(p, true);
    for (const key of ['switch', 'filter'] as const) {
      near(reversed[key].opacity, closing[key].opacity);
      if (closing[key].opacity > 0) for (const property of ['scale', 'x', 'y'] as const)
        near(reversed[key][property], closing[key][property], `${key}.${property} at reversal ${p}`);
    }
    const restored = f.frame(p, false);
    for (const key of ['switch', 'filter'] as const) for (const property of ['opacity', 'scale', 'x', 'y'] as const)
      near(restored[key][property], reversed[key][property]);
  }
  for (const p of [.02, .1, .2, .4, .6, 1]) f.frame(p, true);
  const opened = f.frame(1, true); near(opened.switch.opacity, 0); near(opened.filter.opacity, 0);
});

test('slow keyboard gestures follow progress in both directions without autonomous bounce', () => {
  const f = fixture(); f.frame(1, true);
  const at: Record<string, ReturnType<typeof f.frame>> = {};
  for (const p of [.8, .5, .3, .2, .1, .02, 0]) {
    const value = f.frame(p, true, true); at[p] = value;
    assert.ok(value.switch.scale <= 1 && value.filter.scale <= 1);
    assert.deepEqual(f.frame(p, true, true), value, 'Holding the finger cannot keep the controls animating');
  }
  for (const p of [.02, .1, .2, .3, .5, .8]) {
    const value = f.frame(p, true, true);
    assert.deepEqual(value.switch, at[p]!.switch); assert.deepEqual(value.filter, at[p]!.filter);
  }
  const gesture = f.frame(.2, true, true), cancelled = f.frame(.2, true);
  assert.deepEqual(cancelled.switch, gesture.switch); assert.deepEqual(cancelled.filter, gesture.filter);
});

test('reduced motion removes all scale and positional motion, including during a return', () => {
  const f = fixture(); f.frame(1, true); f.frame(.2, false);
  for (const p of [.2, 0, -.01]) {
    const value = f.frame(p, false, false, true);
    for (const key of ['switch', 'filter'] as const) {
      near(value[key].scale, 1); near(value[key].x, 0); near(value[key].y, 0);
    }
  }
});
