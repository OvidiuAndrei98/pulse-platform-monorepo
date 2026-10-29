import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

function load(native = true, glass = true, available = true) {
  let revision = 0, viewLoads = 0;
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/NativeTabBar.ios.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: any = {};
  const react = { ...React, useState: () => [revision, (next: (v: number) => number) => { revision = next(revision); }] };
  runInNewContext(output, { exports, __DEV__: false, require(name: string) {
    if (name === 'react') return react;
    if (name === 'react-native') return { StyleSheet: { create: (s: unknown) => s } };
    if (name === 'expo') return {
      requireOptionalNativeModule: (module: string) => (module === 'SpottrNativeTabs' ? native : glass) ? {} : null,
      requireNativeView: (module: string) => { assert.equal(module, 'SpottrNativeTabs'); viewLoads++; return 'UIKitTabs'; },
    };
    if (name === 'expo-glass-effect') return { isLiquidGlassAvailable: () => available, isGlassEffectAPIAvailable: () => available };
    if (name === '../PreferencesProvider') return { usePreferences: () => ({ copy: (key: string) => key }) };
    if (name === '../ui/theme') return { colors: { accent: '#ff0044' } };
    throw Error('Unexpected dependency: ' + name);
  } });
  return { ...exports, viewLoads, revision: () => revision };
}

const state = { index: 0, routes: ['Home', 'Explore', 'Feed', 'Profile'].map(name => ({ name, key: name + '-key', params: { retained: true } })) };
const insets = { bottom: 34 };

test('old installed binaries, Expo Go and unsupported systems never load the new view manager', () => {
  for (const flags of [[false, true, true], [true, false, true], [true, true, false]]) {
    const ui = load(...flags);
    assert.equal(ui.NativeTabBar, null);
    assert.equal(ui.viewLoads, 0);
  }
});

test('UIKit selection uses existing organizer/admin routing, without a second tab navigation', () => {
  const ui = load(), selections: string[] = [];
  const element = ui.NativeTabBar({ state, insets, activeIndex: 0, onSelectTab: (name: string) => selections.push(name),
    navigation: { emit() { throw Error('MainTabBar already owns role routing'); } } });
  assert.equal(element.type, 'UIKitTabs');
  assert.equal(element.props.accentColor, '#ff0044');
  assert.equal(element.props.labels.length, 4);
  element.props.onTabSelect({ nativeEvent: { index: 3 } });
  assert.deepEqual(selections, ['Profile']);
  assert.equal(ui.revision(), 1);
});

test('native selection respects prevented tabPress and restores the current route even when its index did not change', () => {
  const ui = load(), navigations: string[] = [], events: unknown[] = [];
  const props = { state, insets, navigation: {
    emit(event: unknown) { events.push(event); return { defaultPrevented: true }; },
    navigate(name: string) { navigations.push(name); },
  } };
  ui.NativeTabBar(props).props.onTabSelect({ nativeEvent: { index: 2 } });
  assert.equal(events.length, 1);
  assert.deepEqual(navigations, []);
  const selection = ui.NativeTabBar(props).props.selection;
  assert.equal(selection.index, 0);
  assert.equal(selection.revision, 1);
});

test('normal selection preserves route params; repeated tabs emit once and never push duplicate screens', () => {
  const ui = load(), navigations: unknown[] = [], events: unknown[] = [];
  const element = ui.NativeTabBar({ state, insets, navigation: {
    emit(event: unknown) { events.push(event); return { defaultPrevented: false }; },
    navigate(...args: unknown[]) { navigations.push(args); },
  } });
  element.props.onTabSelect({ nativeEvent: { index: 1 } });
  element.props.onTabSelect({ nativeEvent: { index: 0 } });
  element.props.onTabSelect({ nativeEvent: { index: 99 } });
  assert.equal(events.length, 2);
  assert.deepEqual(navigations, [['Explore', { retained: true }]]);
});
