import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
const { hooks, modules, deferred, settle } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

test('date ticks trigger immediately without waiting for previous native calls or queuing a replay', async () => {
  const h = hooks(), calls: string[] = [], completion = deferred();
  const app = { currentState: 'active' };
  let focused = true, enabled = true;
  const { useDateRibbonHaptics } = modules({
    react: h.react, 'react-native': { AppState: app },
    '@react-navigation/native': { useFocusEffect: (callback: () => () => void) => h.react.useEffect(() => focused ? callback() : undefined, [focused, callback]) },
    'expo-haptics': { ImpactFeedbackStyle: { Light: 'light' }, impactAsync: (style: string) => { calls.push(style); return completion.promise; } },
  }, { setTimeout() { throw Error('Ticks must not be deferred'); }, requestAnimationFrame() { throw Error('Ticks must not queue'); } })
    .load(path.resolve(__dirname, '../src/screens/useDateRibbonHaptics.ts'));
  const render = () => h.render(() => useDateRibbonHaptics(enabled));
  const pulse = render();
  pulse(); pulse(); pulse();
  assert.deepEqual(calls, ['light', 'light', 'light'], 'A pending native promise cannot suppress later day changes');
  enabled = false; render(); pulse();
  focused = false; enabled = true; render(); pulse();
  focused = true; render(); app.currentState = 'background'; pulse();
  assert.equal(calls.length, 3, 'Closed, unfocused and background selectors are silent');
  app.currentState = 'active'; pulse(); assert.equal(calls.length, 4);
  completion.resolve(); await settle(); assert.equal(calls.length, 4, 'No delayed catch-up after native completion');
  h.unmount(); pulse(); assert.equal(calls.length, 4, 'A stale callback is silent after unmount');
});

test('unavailable native feedback never breaks date selection', async () => {
  for (const fail of [() => { throw Error('unavailable'); }, () => Promise.reject(Error('unavailable'))]) {
    const h = hooks();
    const { useDateRibbonHaptics } = modules({
      react: h.react, 'react-native': { AppState: { currentState: 'active' } },
      '@react-navigation/native': { useFocusEffect: h.react.useEffect },
      'expo-haptics': { ImpactFeedbackStyle: { Light: 'light' }, impactAsync: fail },
    }).load(path.resolve(__dirname, '../src/screens/useDateRibbonHaptics.ts'));
    const pulse = h.render(() => useDateRibbonHaptics(true));
    assert.doesNotThrow(pulse); await settle(); h.unmount();
  }
});

test('Expo Go and older installed binaries never request an unavailable native feedback view', () => {
  const { DateRibbonHaptics, hasNativeDateRibbonHaptics } = modules({
    react: {}, 'react-native': {}, '@react-navigation/native': { useIsFocused: () => true },
    expo: { requireOptionalNativeModule: () => null, requireNativeView() { throw Error('An unavailable view must never be loaded'); } },
  }).load(path.resolve(__dirname, '../src/screens/DateRibbonHaptics.ios.tsx'));
  assert.equal(hasNativeDateRibbonHaptics, false);
  assert.equal(DateRibbonHaptics({ enabled: true, stepWidth: 44 }), null);
});

test('installed iOS feedback observes only a focused open ribbon with the current day width', () => {
  let focused = true;
  const { DateRibbonHaptics, hasNativeDateRibbonHaptics } = modules({
    react: {}, 'react-native': {}, '@react-navigation/native': { useIsFocused: () => focused },
    expo: { requireOptionalNativeModule: () => ({ scrollFeedbackVersion: 1 }), requireNativeView: (name: string) => {
      assert.equal(name, 'SpottrDateHaptics'); return 'NativeDateFeedback';
    } },
  }).load(path.resolve(__dirname, '../src/screens/DateRibbonHaptics.ios.tsx'));
  assert.equal(hasNativeDateRibbonHaptics, true);
  assert.equal(DateRibbonHaptics({ enabled: true, stepWidth: 44 }).props.enabled, true);
  assert.equal(DateRibbonHaptics({ enabled: false, stepWidth: 44 }).props.enabled, false);
  focused = false;
  const hidden = DateRibbonHaptics({ enabled: true, stepWidth: 44 });
  assert.equal(hidden.props.enabled, false);
  assert.equal(hidden.props.stepWidth, 44);
  assert.equal(hidden.props.pointerEvents, 'none');
});
