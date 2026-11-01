import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
const { hooks, modules, find } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function fixture(initial: boolean) {
  const h = hooks();
  let change!: (value: boolean) => void, resolve!: (value: boolean) => void, reject!: (error: Error) => void;
  let removed = 0;
  const snapshot = new Promise<boolean>((yes, no) => { resolve = yes; reject = no; });
  const reanimated = { useReducedMotion: () => initial, ReduceMotion: { Always: 'always', Never: 'never' }, ReducedMotionConfig: 'ReducedMotionConfig' };
  const { useReducedMotionPreference } = modules({
    react: h.react,
    'react-native-reanimated': reanimated,
    'react-native': { AccessibilityInfo: {
      isReduceMotionEnabled: () => snapshot,
      addEventListener: (_: string, listener: (value: boolean) => void) => { change = listener; return { remove: () => removed++ }; },
    } },
  }).load(path.resolve(__dirname, '../src/ui/useReducedMotionPreference.ts'));
  const { InterfaceProvider } = modules({
    react: h.react, 'react-native-reanimated': reanimated,
    './useReducedMotionPreference': { useReducedMotionPreference },
  }).load(path.resolve(__dirname, '../src/ui/InterfaceProvider.tsx'));
  const render = () => find(h.render(() => InterfaceProvider({ children: 'app' })), (node: any) => node.type === 'ReducedMotionConfig')?.props.mode;
  return { render, change: (value: boolean) => change(value), resolve, reject, dispose: () => h.unmount(), removed: () => removed };
}

test('launch respects the system motion preference without forcing a startup override', async () => {
  for (const initial of [false, true]) {
    const f = fixture(initial);
    assert.equal(f.render(), undefined);
    f.resolve(initial); await Promise.resolve();
    assert.equal(f.render(), undefined);
    f.dispose(); assert.equal(f.removed(), 1);
  }
});

test('live accessibility changes override the snapshot and a late initial read cannot undo them', async () => {
  for (const initial of [false, true]) {
    const f = fixture(initial); f.render();
    f.change(!initial);
    assert.equal(f.render(), initial ? 'never' : 'always');
    f.resolve(initial); await Promise.resolve();
    assert.equal(f.render(), initial ? 'never' : 'always');
    f.change(initial); assert.equal(f.render(), undefined);
    f.dispose();
  }
});

test('a newer system snapshot is applied and a failed read keeps the initial system setting', async () => {
  for (const initial of [false, true]) {
    const updated = fixture(initial); updated.render();
    updated.resolve(!initial); await Promise.resolve();
    assert.equal(updated.render(), initial ? 'never' : 'always'); updated.dispose();
    const failed = fixture(initial); failed.render();
    failed.reject(new Error('Unavailable')); await Promise.resolve(); await Promise.resolve();
    assert.equal(failed.render(), undefined); failed.dispose();
  }
});
