import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { MAIN_TAB_LABELS, MAIN_TAB_NAMES } from '@packages/app-core/navigation/mainTabs';
import * as geometry from '../src/navigation/tabCapsuleGeometry';

const elements = (node: any): any[] => Array.isArray(node) ? node.flatMap(elements)
  : React.isValidElement(node) ? [node, ...elements((node.props as any).children)] : [];

function mount(activeIndex = 0, prevented = false, onSelectTab?: (name: string) => void, platform = 'android') {
  const slots: any[] = [], effects: (() => void)[] = [], events: any[] = [], navigations: any[] = [];
  let cursor = 0, tree: any;
  const react = { ...React,
    useId: () => 'test-nav-shape',
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: any) => { slots[i] = value; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useLayoutEffect(effect: () => void, deps: any[]) {
      const i = cursor++, previous = slots[i]; slots[i] = deps;
      if (!previous || deps.some((value, n) => !Object.is(value, previous[n]))) effects.push(effect);
    },
  };
  const props: any = { activeIndex, interactionEnabled: true, onSelectTab, insets: { bottom: 24 },
    state: { index: activeIndex, routes: MAIN_TAB_NAMES.map(name => ({ name, key: 'key-' + name, params: { retained: true } })) },
    navigation: { emit: (event: any) => { events.push(event); return { defaultPrevented: prevented }; }, navigate: (...args: any[]) => navigations.push(args) },
  };
  const deps: Record<string, any> = {
    react, 'react-native': { View: 'View', Pressable: 'Pressable', Platform: { OS: platform }, useWindowDimensions: () => ({ width: 390 }), StyleSheet: {
      create: (styles: any) => styles, absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    } },
    '@packages/app-core/navigation/mainTabs': { MAIN_TAB_LABELS },
    '../ui/theme': { colors: { accent: '#ff0044' } }, '../usePreferences': { usePreferences: () => ({ copy: (key: string) => key }) },
    '../ui/ToastHost': { ToastHost: 'ToastHost' }, './TabBarSurface': { TabBarSurface: 'Surface' },
    './TabBarIcon': { TabBarIcon: 'Icon' }, './TabIndicator': { TabIndicator: 'Indicator' },
    './ContinuousNavShape': { ContinuousNavShape: 'Shape' }, './NavBarMask': { NavBarMask: 'Mask' },
    './useTabIndicator': { useTabIndicator: (index: number, spacing: number) => ({ value: index * spacing }) },
    './tabCapsuleGeometry': geometry,
  };
  const exports: any = {};
  runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/SimpleCapsuleTabBar.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const render = (next = {}) => { Object.assign(props, next); cursor = 0; tree = exports.SimpleCapsuleTabBar(props); while (effects.length) effects.shift()!(); };
  const find = (id: string) => elements(tree).find(element => element.props.testID === id);
  render();
  return { props, render, find, events, navigations, tree: () => tree,
    measure: (width: number) => { find('tab-bar').props.onLayout({ nativeEvent: { layout: { width } } }); render(); },
    indicator: () => elements(tree).find(element => element.type === 'Indicator'),
  };
}

test('Android keeps the wide capsule, even icon spacing and separate touch cells at every position', () => {
  for (const width of [280, 350, 390, 728]) for (let index = 0; index < 5; index++) {
    const ui = mount(index); ui.measure(width);
    const bar = Object.assign({}, ...ui.find('tab-bar').props.style), indicator = Object.assign({}, ...ui.indicator().props.style);
    assert.equal(bar.height, 62); assert.equal(bar.padding, 4);
    assert.equal(indicator.top, 1); assert.equal(indicator.bottom, 1);
    assert.equal(indicator.backgroundColor, undefined, 'Only the continuous contour paints the selection');
    const shapes = elements(ui.tree()).filter(element => element.type === 'Shape');
    assert.equal(shapes[0].props.height, 62); assert.equal(shapes[0].props.width, width);
    assert.equal(shapes[1].props.height, 52); assert.equal(shapes[1].props.width, indicator.width);
    assert.equal(indicator.borderWidth, undefined); assert.equal(indicator.boxShadow, undefined);
    const targets = MAIN_TAB_NAMES.map(name => Object.assign({}, ...ui.find('tab-' + name).props.style));
    let offset = 0;
    const centers = targets.map((target, n) => {
      assert.ok(target.width >= 44);
      const icon = ui.find('tab-icon-' + MAIN_TAB_NAMES[n]).props.style;
      const center = 4 + offset + target.width / 2 + icon.transform[0].translateX;
      offset += target.width;
      return center;
    });
    assert.ok(Math.abs(offset - (width - 8)) < 1e-6, 'Touch cells cover the track without overlap');
    const spacing = centers[1] - centers[0];
    centers.forEach((center, n) => assert.ok(Math.abs(center - centers[0] - n * spacing) < 1e-6));
    assert.ok(Math.abs(indicator.width / spacing - 1.15) < 1e-6);
    const left = 4 + indicator.left + ui.indicator().props.position.value;
    assert.ok(Math.abs(left + indicator.width / 2 - centers[index]) < 1e-6);
    if (index === 0) assert.ok(Math.abs(left - 5) < 1e-6);
    if (index === 4) assert.ok(Math.abs(width - left - indicator.width - 5) < 1e-6);
  }
});

test('Android touch, accessibility, prevented navigation and role routing retain their existing behavior', () => {
  const ui = mount(); ui.measure(350);
  const profile = ui.find('tab-Profile');
  profile.props.onTouchStart(); profile.props.onPress({ nativeEvent: { identifier: 0 } });
  assert.equal(ui.events.length, 1); assert.equal(ui.navigations.length, 1);
  assert.equal(ui.navigations[0][0], 'Profile'); assert.equal(ui.navigations[0][1].retained, true);
  profile.props.onPress({ nativeEvent: {} }); assert.equal(ui.events.length, 2, 'TalkBack and hardware activation works');
  const prevented = mount(0, true); prevented.measure(350); prevented.find('tab-Profile').props.onTouchStart();
  assert.equal(prevented.navigations.length, 0);
  const selected: string[] = [], role = mount(0, false, name => selected.push(name)); role.measure(350);
  for (let i = 0; i < 20; i++) role.find('tab-' + MAIN_TAB_NAMES[i % 5]).props.onTouchStart();
  assert.equal(selected.length, 20); assert.equal(selected.at(-1), 'Profile'); assert.equal(role.navigations.length, 0);
  role.render({ interactionEnabled: false }); role.find('tab-Home').props.onTouchStart();
  assert.equal(selected.length, 20); assert.equal(role.tree().props.pointerEvents, 'none');
});

test('Android uses the same SVG artwork and selected fills without any Apple native dependency', () => {
  const load = (file: string) => {
    const exports: any = {};
    runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation', file), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText, { exports, require: (name: string) => {
      if (name === 'react') return React;
      if (name === 'react-native-svg') return { __esModule: true, default: 'Svg', Path: 'Path' };
      throw new Error('Unexpected platform dependency: ' + name);
    } });
    return exports.TabBarIcon;
  };
  const android = load('TabBarIcon.android.tsx'), ios = load('TabBarIcon.ios.tsx');
  for (let index = 0; index < 5; index++) for (const active of [false, true]) {
    const actual = android({ index, active, size: 26 }), expected = ios({ index, active, size: 26 });
    assert.equal(actual.props.width, 26); assert.equal(actual.props.height, 26); assert.equal(actual.props.stroke, 'white');
    assert.equal(actual.props.children.props.d, expected.props.children.props.d);
    assert.equal(actual.props.children.props.fill, expected.props.children.props.fill);
  }
});

test('native browser contact and release select once, while virtual and keyboard clicks still work', () => {
  const selections: string[] = [], ui = mount(0, false, name => selections.push(name), 'web');
  ui.measure(350);
  const profile = ui.find('tab-Profile');
  assert.equal(profile.props.onTouchStart, undefined, 'Web never adds another activation path for touch');
  profile.props.onPressIn(); ui.render({ activeIndex: 4 });
  assert.equal(ui.find('tab-Profile').props['aria-selected'], true);
  assert.equal(ui.find('tab-Home').props['aria-selected'], false);
  ui.find('tab-Profile').props.onPress({ nativeEvent: { type: 'click', detail: 1 } });
  assert.deepEqual(selections, ['Profile'], 'Release cannot duplicate the contact navigation');
  ui.find('tab-Home').props.onPress({ nativeEvent: { type: 'click', detail: 0 } });
  ui.find('tab-Explore').props.onPress({ nativeEvent: { type: 'keyup' } });
  assert.deepEqual(selections, ['Profile', 'Home', 'Explore']);
  const surface = Object.assign({}, ...ui.find('tab-bar').props.style);
  assert.match(surface.backgroundImage, /linear-gradient/); assert.equal(surface.backdropFilter, 'blur(16px)');
});
