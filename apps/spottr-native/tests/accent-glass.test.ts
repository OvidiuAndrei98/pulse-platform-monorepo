import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { loadYoga } from 'yoga-layout/load';
import type { ViewStyle } from 'react-native';
import { accentGlassButtonStyles, isAccentFill } from '../src/ui/accentGlassButtonStyles';
import { liquidGlassAppearance } from '../src/ui/liquidGlassAppearance';

function flatten(value: any): any { return Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean).map(flatten)) : value; }
function loadAccent(present: boolean, compiled = true, runtime = true) {
  let imports = 0;
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '../src/ui/AccentPressable.ios.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  runInNewContext(output, { exports, require(name: string) {
    if (name === 'react') return React;
    if (name === 'react-native') return { Pressable: 'NativePressable', StyleSheet: { flatten } };
    if (name === 'expo') return { requireOptionalNativeModule: () => present ? {} : null };
    if (name === 'expo-glass-effect') {
      assert.equal(present, true); imports++;
      return { GlassView: 'NativeGlass', isLiquidGlassAvailable: () => compiled, isGlassEffectAPIAvailable: () => runtime };
    }
    if (name === './AccentPressableFallback') return { AccentPressableFallback: 'OriginalButton' };
    if (name === './accentGlassButtonStyles') return { accentGlassButtonStyles, isAccentFill };
    if (name === './liquidGlassAppearance') return { liquidGlassAppearance };
    if (name === './MotionPressable') return { MotionPressable: 'MotionControl' };
    throw new Error(name);
  } });
  return { render: exports.AccentPressable.render, imports };
}

test('colored glass retains the exact accent, children, event handler and layout ref', () => {
  const adapter = loadAccent(true), ref = React.createRef(), press = () => {}, layout = () => {};
  const children = React.createElement('Label'), element = adapter.render({
    style: { backgroundColor: '#ff0044', flex: 1, height: 44, paddingHorizontal: 12, gap: 8, flexDirection: 'row' },
    onPress: press, onLayout: layout, children, testID: 'continue', accessibilityState: { busy: true },
  }, ref);
  assert.equal(element.type, 'NativeGlass');
  assert.equal(element.props.tintColor, '#ff0044');
  assert.equal(element.props.glassEffectStyle, liquidGlassAppearance.glassEffectStyle);
  assert.equal(element.props.isInteractive, true);
  assert.equal(element.props.style.opacity, 1);
  assert.equal(element.props.style.backgroundColor, 'transparent');
  assert.equal(element.props.onLayout, layout);
  const control = element.props.children;
  assert.equal(control.props.onPress, press);
  assert.equal(control.props.ref, ref);
  assert.equal(control.props.children, children);
  assert.equal(control.props.testID, 'continue');
  assert.equal(control.props.accessibilityState.busy, true);
});

test('disabled and pressed feedback dims only content while retaining the glass', () => {
  const adapter = loadAccent(true);
  const disabled = adapter.render({ disabled: true, style: { backgroundColor: '#ff0044', opacity: .25 } }, null);
  assert.equal(disabled.props.pointerEvents, 'none');
  assert.equal(disabled.props.style.opacity, 1);
  assert.equal(disabled.props.children.props.disabled, true);
  assert.equal(flatten(disabled.props.children.props.style({ pressed: false })).opacity, .25);
  const pressed = adapter.render({ style: ({ pressed }: { pressed: boolean }) => ({ backgroundColor: '#ff0044', opacity: pressed ? .7 : 1 }) }, null);
  assert.equal(pressed.props.style.opacity, 1);
  assert.equal(flatten(pressed.props.children.props.style({ pressed: true })).opacity, .7);
});

test('Google can retain its white fill, logo, label and sign-in action in the same material', () => {
  const logo = React.createElement('GoogleLogo'), label = React.createElement('Label', { style: { color: 'black' } }), press = () => {};
  const element = loadAccent(true).render({ glassColor: 'white', style: { backgroundColor: 'white', height: 56 }, children: [logo, label], onPress: press }, null);
  assert.equal(element.props.tintColor, 'white');
  assert.equal(element.props.glassEffectStyle, 'regular');
  assert.equal(element.props.style.height, 56);
  assert.equal(element.props.children.props.children[0], logo);
  assert.equal(element.props.children.props.children[1], label);
  assert.equal(element.props.children.props.onPress, press);
});

test('conditional secondary actions and unavailable native modules preserve the original button', () => {
  const fallback = () => null, press = () => {};
  for (const [present, compiled, runtime] of [[false, true, true], [true, false, true], [true, true, false]]) {
    const adapter = loadAccent(present!, compiled!, runtime!);
    const style = { backgroundColor: '#ff0044', width: '100%' };
    const element = adapter.render({ style, onPress: press, fallback, disabled: true }, null);
    assert.equal(element.type, 'OriginalButton');
    assert.equal(element.props.style, style);
    assert.equal(element.props.fallback, fallback);
    assert.equal(element.props.disabled, true);
    assert.equal(element.props.onPress, press);
    assert.equal(adapter.imports, present ? 1 : 0);
  }
  const adapter = loadAccent(true), ref = React.createRef();
  const secondary = adapter.render({ style: { backgroundColor: '#ffffff08' } }, ref);
  const primary = adapter.render({ style: { backgroundColor: '#ff0044' } }, ref);
  assert.equal(secondary.type, primary.type, 'Selection keeps the native host and keyboard focus');
  assert.equal(secondary.props.children.type, primary.props.children.type);
  assert.equal(secondary.props.children.props.ref, ref);
  assert.equal(secondary.props.glassEffectStyle, 'none');
  assert.equal(secondary.props.children.props.style({ pressed: false }).backgroundColor, '#ffffff08');
  assert.equal(primary.props.children.props.static, true, 'UIKit owns colored press feedback');
  assert.equal(secondary.props.children.props.static, false, 'Secondary keeps its existing press feedback');
  assert.equal(isAccentFill('#FF0044'), true);
  assert.equal(isAccentFill('#ff004426'), false);
});

test('glass capsules preserve flexible CTA, intrinsic label and full-width button geometry', async () => {
  const y = await loadYoga();
  function apply(node: ReturnType<typeof y.Node.create>, style: ViewStyle) {
    for (const [key, method] of [['width', 'setWidth'], ['height', 'setHeight'], ['minWidth', 'setMinWidth'], ['minHeight', 'setMinHeight'], ['maxWidth', 'setMaxWidth'], ['maxHeight', 'setMaxHeight']] as const)
      if (style[key] !== undefined) (node[method] as (value: unknown) => void)(style[key]);
    if (style.flex) { node.setFlexGrow(style.flex); node.setFlexBasis(0); }
    if (style.flexGrow !== undefined) node.setFlexGrow(style.flexGrow);
    if (style.flexShrink !== undefined) node.setFlexShrink(style.flexShrink);
    node.setFlexDirection(style.flexDirection === 'row' ? y.FLEX_DIRECTION_ROW : y.FLEX_DIRECTION_COLUMN);
    if (style.alignItems) node.setAlignItems(style.alignItems === 'center' ? y.ALIGN_CENTER : y.ALIGN_STRETCH);
    if (style.alignSelf === 'stretch') node.setAlignSelf(y.ALIGN_STRETCH);
    if (style.justifyContent === 'center') node.setJustifyContent(y.JUSTIFY_CENTER);
    if (typeof style.gap === 'number') node.setGap(y.GUTTER_ALL, style.gap);
    if (typeof style.borderWidth === 'number') node.setBorder(y.EDGE_ALL, style.borderWidth);
    for (const [key, edge] of [['padding', y.EDGE_ALL], ['paddingHorizontal', y.EDGE_HORIZONTAL], ['paddingVertical', y.EDGE_VERTICAL], ['paddingLeft', y.EDGE_LEFT], ['paddingRight', y.EDGE_RIGHT], ['paddingTop', y.EDGE_TOP], ['paddingBottom', y.EDGE_BOTTOM]] as const)
      if (typeof style[key] === 'number') node.setPadding(edge, style[key]);
  }
  for (const style of [
    { backgroundColor: '#ff0044', flex: 1, minWidth: 0, height: 44, paddingHorizontal: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
    { backgroundColor: '#ff0044', width: '100%', minHeight: 52, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
    { backgroundColor: '#ff0044', minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  ] as ViewStyle[]) for (const screenWidth of [288, 358, 736]) {
    const dimensions: { width: number; height: number }[] = [];
    for (const glass of [false, true, 'secondary'] as const) {
      const root = y.Node.create(); root.setWidth(screenWidth); root.setFlexDirection(y.FLEX_DIRECTION_ROW); root.setAlignItems(y.ALIGN_CENTER);
      if (style.flex) { const share = y.Node.create(); share.setWidth(44); share.setHeight(44); root.insertChild(share, 0); root.setGap(y.GUTTER_ALL, 8); }
      const surface = y.Node.create(), control = glass ? y.Node.create() : surface;
      if (glass) { const layout = accentGlassButtonStyles(style, false, glass !== 'secondary'); apply(surface, layout.surface); apply(control, layout.control); surface.insertChild(control, 0); }
      else apply(surface, style);
      const label = y.Node.create(); label.setWidth(120); label.setHeight(18); control.insertChild(label, 0);
      root.insertChild(surface, root.getChildCount()); root.calculateLayout(undefined, undefined, y.DIRECTION_LTR);
      const bounds = surface.getComputedLayout(); dimensions.push({ width: bounds.width, height: bounds.height });
      assert.ok(control.getComputedWidth() >= 120, 'The label never becomes a circular icon button');
      root.freeRecursive();
    }
    assert.deepEqual(dimensions[1], dimensions[0], JSON.stringify({ style, screenWidth, dimensions }));
    assert.deepEqual(dimensions[2], dimensions[0], 'Secondary geometry also remains stable');
  }
});
