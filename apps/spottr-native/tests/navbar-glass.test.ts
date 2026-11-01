import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { liquidGlassAppearance } from '../src/ui/liquidGlassAppearance';

// Load the actual iOS adapter without requiring UIKit on the Windows test host.
// Missing native modules are a real upgrade case: JS can refresh before a rebuild.
function loadSurface(modulePresent: boolean, compiled = true, runtime = true, file = 'TabBarSurface.ios.tsx') {
  let glassImports = 0;
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation', file), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  runInNewContext(output, {
    exports,
    require(name: string) {
      if (name === 'react') return React;
      if (name === 'react-native') return { View: 'View', StyleSheet: { absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, create: (styles: unknown) => styles } };
      if (name === '../ui/theme') return { colors: { accent: '#ff0044' } };
      if (name === 'expo') return { requireOptionalNativeModule: (nativeName: string) => {
        assert.equal(nativeName, 'ExpoGlassEffect');
        return modulePresent ? {} : null;
      } };
      if (name === 'expo-glass-effect') {
        glassImports++;
        if (!modulePresent) throw new Error('Native view manager is not installed in this binary');
        return { GlassView: 'NativeGlassView', isLiquidGlassAvailable: () => compiled, isGlassEffectAPIAvailable: () => runtime };
      }
      if (name === './TabBarSurfaceFallback') return { TabBarSurfaceFallback: 'LegacySurface' };
      if (name === '../ui/liquidGlassAppearance') return { liquidGlassAppearance };
      throw new Error('Unexpected import: ' + name);
    },
  });
  return { ...exports, glassImports };
}

test('an existing installed binary can receive the navbar JS without the new native module', () => {
  const surface = loadSurface(false);
  assert.equal(surface.glassImports, 0);
  assert.equal(surface.usesLiquidGlass, false);
  const buttons = React.createElement('Buttons');
  const view = surface.TabBarSurface({ children: buttons, testID: 'tab-bar' });
  assert.equal(view.type, 'LegacySurface');
  assert.equal(view.props.children, buttons);
  assert.equal(view.props.testID, 'tab-bar');
});

for (const [label, compiled, runtime] of [
  ['older iOS or compatibility build', false, true],
  ['iOS with unavailable glass runtime API', true, false],
] as const) {
  test(label + ' keeps a working fallback navbar', () => {
    const surface = loadSurface(true, compiled, runtime);
    assert.equal(surface.usesLiquidGlass, false);
    const layout = () => {};
    const view = surface.TabBarSurface({ onLayout: layout, pointerEvents: 'box-none' });
    assert.equal(view.type, 'LegacySurface');
    assert.equal(view.props.onLayout, layout);
    assert.equal(view.props.pointerEvents, 'box-none');
  });
}

test('supported iOS keeps the actual tab controls inside the native glass content view', () => {
  const surface = loadSurface(true);
  assert.equal(surface.usesLiquidGlass, true);
  const buttons = React.createElement('Buttons');
  const view = surface.TabBarSurface({ children: buttons, testID: 'tab-bar', style: { height: 66, padding: 8 } });
  assert.equal(view.type, 'NativeGlassView');
  assert.equal(view.props.children, buttons, 'No overlay or cloned controls should intercept tab gestures');
  assert.equal(view.props.testID, 'tab-bar');
  assert.equal(view.props.isInteractive, true);
  assert.equal(view.props.colorScheme, 'dark');
  assert.equal(view.props.glassEffectStyle, 'regular');
  assert.equal(view.props.tintColor, 'rgba(0,0,0,0.15)');
  const style = Object.assign({}, ...view.props.style);
  assert.equal(style.height, 66);
  assert.equal(style.padding, 8);
  assert.equal(style.opacity, undefined, 'UIKit must not be hidden behind an opacity animation');
});

test('iPhone navigation artwork does not require SF Symbols and has a consistent optical size', () => {
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/TabBarIcon.ios.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  runInNewContext(output, { exports, require(name: string) {
    if (name === 'react') return React;
    if (name === 'react-native-svg') return { __esModule: true, default: 'Svg', Path: 'Path' };
    throw new Error('Must not load an uninstalled native symbol manager: ' + name);
  } });
  for (let index = 0; index < 4; index++) {
    const icon = exports.TabBarIcon({ index, active: true, color: '#ff0044', size: 22, strokeWidth: 2.2 });
    assert.equal(icon.type, 'Svg');
    assert.equal(icon.props.width, 26);
    assert.equal(icon.props.height, 26);
    assert.equal(icon.props.stroke, 'white');
    assert.ok(icon.props.children.props.d.length > 20);
  }
});

test('the iPhone selection stays flat even when native Liquid Glass is available', () => {
  const surface = loadSurface(true, true, true, 'TabBarIndicatorSurface.ios.tsx');
  const view = surface.TabBarIndicatorSurface();
  assert.equal(view.type, 'View');
  assert.equal(surface.glassImports, 0);
  assert.equal(view.props.pointerEvents, 'none');
  assert.equal(view.props.style.backgroundColor, '#ff004473');
  assert.equal(view.props.style.borderCurve, 'continuous');
  assert.equal(view.props.style.opacity, undefined);
});

for (const [label, present, compiled, runtime] of [
  ['a binary without the glass module', false, true, true],
  ['an older iOS version', true, false, true],
  ['a runtime without the glass API', true, true, false],
] as const) {
  test('the selection keeps its previous accent surface on ' + label, () => {
    const surface = loadSurface(present, compiled, runtime, 'TabBarIndicatorSurface.ios.tsx');
    const view = surface.TabBarIndicatorSurface();
    assert.equal(view.type, 'View');
    assert.equal(surface.glassImports, 0, 'The indicator never imports an unavailable view manager');
    assert.equal(view.props.pointerEvents, 'none');
    assert.equal(view.props.style.backgroundColor, '#ff004473');
  });
}

test('Android and web keep the flat selection without importing UIKit', () => {
  const surface = loadSurface(false, false, false, 'TabBarIndicatorSurface.tsx');
  const view = surface.TabBarIndicatorSurface();
  assert.equal(view.type, 'View');
  assert.equal(surface.glassImports, 0);
  assert.equal(view.props.style.backgroundColor, '#ff004440');
  assert.equal(view.props.style.borderRadius, 26);
});
