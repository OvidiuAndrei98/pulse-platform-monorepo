import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { getTabCapsuleGeometry } from '../src/navigation/tabCapsuleGeometry';
import { advanceTabMotion, idleTabMotion, startTabMotion } from '../src/navigation/tabSynchronizedMotion';

import { writeFileSync } from 'node:fs';

// Run the installed Reanimated solver, rather than a second implementation of
// spring physics. Only its native runtime/reduced-motion boundary is simulated.
function fixture(reduced = false) {
  const library = dirname(require.resolve('react-native-reanimated/package.json'));
  const cache = new Map<string, any>();
  let clock = 1000;
  const frames: ((timestamp: number) => void)[] = [];
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file);
    const exports: any = {};
    cache.set(file, exports);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(source, { exports,
      global: { _getAnimationTimestamp: () => clock },
      requestAnimationFrame: (callback: (timestamp: number) => void) => frames.push(callback),
      require(name: string): any {
      if (name === '../../common' || name === '../common') return { logger: { warn: (message: string) => { throw Error(message); } } };
      if (name === '../util' || name === './util') return {
        defineAnimation: (_: unknown, factory: () => any) => factory(),
        getReduceMotionForAnimation: () => reduced,
      };
      if (name === 'react-native-reanimated') return {
        ...load(resolve(library, 'src/animation/spring/spring.ts')),
        ...load(resolve(library, 'src/animation/sequence.ts')),
        Easing: { out: (x: unknown) => x, quad: 'quad' }, ReduceMotion: { System: 'system' },
      };
      return load(resolve(dirname(file), name + '.ts'));
    } });
    return exports;
  }
  const { valueSetter } = load(resolve(library, 'src/valueSetter.ts'));
  return { ...load(resolve(__dirname, '../src/navigation/tabCapsuleSpring.ts')),
    mutable(initial = 0) {
      const mutable = { _value: initial, _animation: null };
      Object.defineProperty(mutable, 'value', {
        get: () => mutable._value,
        set: value => valueSetter(mutable, value),
      });
      return mutable as typeof mutable & { value: any };
    },
    tick(dt = 1000 / 120) { clock += dt; for (const callback of frames.splice(0)) callback(clock); },
    get pendingFrames() { return frames.length; },
    withSpring: load(resolve(library, 'src/animation/spring/spring.ts')).withSpring };
}

test('reversing a travelling capsule preserves position and velocity, then turns smoothly', () => {
  const { withTabTravel } = fixture();
  const forward = withTabTravel(264);
  forward.onStart(forward, 0, 1000, undefined);
  forward.onFrame(forward, 1050);
  assert.ok(forward.current > 0 && forward.velocity > 0);
  const reverse = withTabTravel(0);
  reverse.onStart(reverse, forward.current, 1050, forward);
  assert.equal(reverse.current, forward.current);
  assert.equal(reverse.velocity, forward.velocity, 'No instantaneous braking on a new tap');
  reverse.onFrame(reverse, 1058);
  assert.ok(reverse.current > forward.current, 'Momentum is decelerated, not cut');
  reverse.onFrame(reverse, 1120);
  assert.ok(reverse.velocity < 0, 'The new destination takes over promptly');
});

test('repeated rapid destinations finish on the last request without replaying old trips', () => {
  const { withTabTravel } = fixture();
  let animation: any, now = 1000, position = 0;
  for (const destination of [264, 0, 88, 264, 176, 0, 88]) {
    const next = withTabTravel(destination);
    next.onStart(next, position, now, animation);
    if (animation?.lastTimestamp) assert.equal(next.velocity, animation.velocity);
    animation = next;
    for (let n = 0; n < 6; n++) { now += 1000 / 120; animation.onFrame(animation, now); }
    position = animation.current;
    assert.ok(position > -20 && position < 284, 'Inertia remains contained around the bar');
  }
  for (let n = 0; n < 150; n++) { now += 1000 / 120; animation.onFrame(animation, now); }
  assert.equal(animation.current, 88);
  assert.equal(animation.velocity, 0);
});

test('a destination at the current position still dissipates existing momentum', () => {
  const { withTabTravel } = fixture();
  const first = withTabTravel(264);
  first.onStart(first, 0, 1000, undefined); first.onFrame(first, 1050);
  const next = withTabTravel(first.current);
  next.onStart(next, first.current, 1050, first);
  assert.ok(next.initialEnergy > 0);
  assert.equal(next.onFrame(next, 1058), false, 'Nonzero kinetic energy must not terminate immediately');
});

test('a single trip has a restrained settle and reduced motion does not inherit velocity', () => {
  const { withTabTravel } = fixture();
  const animation = withTabTravel(176);
  animation.onStart(animation, 0, 1000, undefined);
  let maximum = 0;
  for (let n = 1; n <= 120; n++) {
    animation.onFrame(animation, 1000 + n * 1000 / 120);
    maximum = Math.max(maximum, animation.current);
    if (n === 24) assert.ok(animation.current > 176 * .94, 'Most travel finishes by 200ms');
  }
  assert.ok(maximum < 176 * 1.02, 'Terminal overshoot stays below two percent');
  const reduced = fixture(true).withTabTravel(0);
  reduced.onStart(reduced, 88, 1000, { ...animation, velocity: 700, lastTimestamp: 990 });
  assert.equal(reduced.reduceMotion, true);
  assert.equal(reduced.velocity, 0, 'The custom continuity rule does not override reduced motion');
});

test('skipping tabs glides further in time while neighbours keep their existing response', () => {
  const { withTabTravel } = fixture();
  const oldNeighbour = withTabTravel(88), neighbour = withTabTravel(88, 1);
  const oldLong = withTabTravel(264), glide = withTabTravel(264, 3);
  for (const animation of [oldNeighbour, neighbour, oldLong, glide]) animation.onStart(animation, 0, 1000, undefined);
  let maximum = 0;
  for (let n = 1; n <= 120; n++) {
    for (const animation of [oldNeighbour, neighbour, oldLong, glide]) animation.onFrame(animation, 1000 + n * 1000 / 120);
    assert.equal(neighbour.current, oldNeighbour.current);
    maximum = Math.max(maximum, glide.current);
    if (n === 12) assert.ok(glide.current < oldLong.current && glide.current > 80, 'A longer glide still responds immediately');
    if (n === 36) assert.ok(Math.abs(glide.current - 264) < 5, 'Full traversal is nearly settled by 300ms');
  }
  assert.ok(maximum < 264 * 1.02);
  assert.equal(glide.current, 264);
});

test('a long glide interrupted by a nearby tap keeps its momentum and ends at the latest tab', () => {
  const { withTabTravel } = fixture();
  const glide = withTabTravel(264, 3);
  glide.onStart(glide, 0, 1000, undefined); glide.onFrame(glide, 1050);
  const reverse = withTabTravel(0, glide.current / 88);
  reverse.onStart(reverse, glide.current, 1050, glide);
  assert.equal(reverse.current, glide.current);
  assert.equal(reverse.velocity, glide.velocity);
  for (let n = 1; n <= 120; n++) reverse.onFrame(reverse, 1050 + n * 1000 / 120);
  assert.equal(reverse.current, 0);
});

test('the installed solver drives bar, icons and indicator together at 60 and 120 Hz', () => {
  const g = getTabCapsuleGeometry(362, 5), traces: any[] = [];
  const peaks = new Map<string, { strain: number; compression: number }>();
  for (const hz of [60, 120]) for (const side of [-1, 1]) for (const tabs of [1, 2, 3, 4]) {
    const { withTabTravel } = fixture();
    const target = side < 0 ? 0 : g.limit, start = target - side * tabs * g.spacing;
    const animation = withTabTravel(target, tabs);
    animation.onStart(animation, start, 1000, undefined);
    let state = startTabMotion(idleTabMotion(start, g, 1000), start, target, g, 1000);
    let peakStrain = 0, peakCompression = 0, previousPhase = 0, descending = false;
    let previousX = g.firstCenter + start, previousSpeed = Infinity, recoiling = false;
    const samples: any[] = [];
    for (let frame = 1; frame <= hz; frame++) {
      const now = 1000 + frame * 1000 / hz;
      animation.onFrame(animation, now);
      state = advanceTabMotion(state, animation.current, g, now, 0, false, false);
      const p = state.pose, strain = p.barScaleX - 1;
      assert.ok(Object.values(p).every(Number.isFinite));
      assert.ok(state.phase >= previousPhase);
      assert.ok(strain >= 0 && strain <= 0.018 * tabs / 4 + 1e-9);
      if (descending) assert.ok(strain <= peakStrain + 1e-9);
      if (strain < peakStrain - 1e-9) descending = true;
      peakStrain = Math.max(peakStrain, strain);
      peakCompression = Math.max(peakCompression, 1 - p.indicatorScaleY);
      const centers = g.tabs.map(tab => g.width / 2 + p.barX + p.barScaleX * (tab.center - g.width / 2));
      const far = side > 0 ? 0 : 4;
      assert.ok(Math.abs(centers[far]! - g.tabs[far]!.center) < 1e-9);
      centers.slice(1).forEach((x, i) => assert.ok(Math.abs(x - centers[i]! - g.spacing * p.barScaleX) < 1e-9));
      const screenX = g.width / 2 + p.barX + p.barScaleX * (g.firstCenter + p.indicatorX - g.width / 2);
      const speed = side * (screenX - previousX) * hz;
      if (state.phase > .55 && speed > 0 && previousSpeed > 0) {
        assert.ok(speed <= previousSpeed + .01, 'Visible travel cannot accelerate into a separate late push');
      }
      if (speed < -.01) recoiling = true;
      if (recoiling) assert.ok(speed < hz * .01, 'Arrival has one recoil, never a second outward swing beyond subpixel solver noise: ' + JSON.stringify({hz,side,tabs,now,speed,phase:state.phase,screenX}));
      samples.push({ ms: now - 1000, x: animation.current, screenX, phase: state.phase, strain, scaleY: p.indicatorScaleY });
      previousPhase = state.phase; previousX = screenX; previousSpeed = speed;
    }
    const previous = peaks.get(`${hz}:${side}`);
    if (previous) {
      assert.ok(peakStrain > previous.strain);
      assert.ok(peakCompression > previous.compression);
    }
    peaks.set(`${hz}:${side}`, { strain: peakStrain, compression: peakCompression });
    assert.equal(state.pose.barScaleX, 1); assert.equal(state.pose.barX, 0);
    assert.equal(state.pose.indicatorX, target); assert.equal(state.pose.indicatorScaleX, 1);
    assert.equal(state.pose.indicatorScaleY, 1);
    assert.deepEqual(advanceTabMotion(state, target, g, 5000, 0, false, false).pose, state.pose, 'No separate contact animation survives arrival');
    traces.push({ hz, side, tabs, peakStrain, peakCompression, samples });
  }
  writeFileSync('artifacts/navbar-synchronized-motion.json', JSON.stringify(traces, null, 2));
});

test('real rapid reversals retain the displayed pose and finish only the latest movement', () => {
  const { withTabTravel } = fixture(), g = getTabCapsuleGeometry(362, 5);
  let x = 0, now = 1000, animation: any, state = idleTabMotion(x, g, now);
  for (const destination of [4, 0, 3, 1, 4, 0, 2, 4]) {
    const pose = state.pose, target = destination * g.spacing;
    state = startTabMotion(state, x, target, g, now);
    assert.deepEqual(state.pose, pose);
    const next = withTabTravel(target, Math.abs(target - x) / g.spacing);
    next.onStart(next, x, now, animation); animation = next;
    for (let frame = 0; frame < 8; frame++) {
      now += 1000 / 120; animation.onFrame(animation, now); x = animation.current;
      state = advanceTabMotion(state, x, g, now, 0, false, false);
      assert.ok(Object.values(state.pose).every(Number.isFinite));
    }
  }
  for (let frame = 0; frame < 120; frame++) {
    now += 1000 / 120; animation.onFrame(animation, now);
    state = advanceTabMotion(state, animation.current, g, now, 0, false, false);
  }
  assert.equal(state.pose.indicatorX, g.limit);
  assert.equal(state.pose.barScaleX, 1); assert.equal(state.pose.barX, 0);
});
