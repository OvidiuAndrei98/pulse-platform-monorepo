import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Run the installed Reanimated solver, rather than a second implementation of
// spring physics. Only its native runtime/reduced-motion boundary is simulated.
function fixture(reduced = false) {
  const library = dirname(require.resolve('react-native-reanimated/package.json'));
  const cache = new Map<string, any>();
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file);
    const exports: any = {};
    cache.set(file, exports);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(source, { exports, require(name: string): any {
      if (name === '../../common') return { logger: { warn: (message: string) => { throw Error(message); } } };
      if (name === '../util') return {
        defineAnimation: (_: unknown, factory: () => any) => factory(),
        getReduceMotionForAnimation: () => reduced,
      };
      if (name === 'react-native-reanimated') return {
        ...load(resolve(library, 'src/animation/spring/spring.ts')),
        Easing: { out: (x: unknown) => x, quad: 'quad' }, ReduceMotion: { System: 'system' },
      };
      return load(resolve(dirname(file), name + '.ts'));
    } });
    return exports;
  }
  return load(resolve(__dirname, '../src/navigation/tabCapsuleSpring.ts'));
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
