import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

// Load the actual iOS adapter without requiring UIKit on the Windows test host.
// Missing native modules are a real upgrade case: JS can refresh before a rebuild.
function loadSurface(modulePresent: boolean, compiled = true, runtime = true) {
  let glassImports = 0;
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/TabBarSurface.ios.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  runInNewContext(output, {
    exports,
    require(name: string) {
      if (name === 'react') return React;
      if (name === 'react-native') return { StyleSheet: { create: (styles: unknown) => styles } };
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
  const style = Object.assign({}, ...view.props.style);
  assert.equal(style.height, 66);
  assert.equal(style.padding, 8);
  assert.equal(style.opacity, undefined, 'UIKit must not be hidden behind an opacity animation');
});

test('a binary without SF Symbols still renders its tab icons after a JS refresh', () => {
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/TabBarIcon.ios.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  runInNewContext(output, { exports, require(name: string) {
    if (name === 'react') return React;
    if (name === 'expo') return { requireOptionalNativeModule: (nativeName: string) => {
      assert.equal(nativeName, 'SymbolModule');
      return null;
    } };
    if (name === './TabBarIconFallback') return { TabBarIconFallback: 'LegacyIcon' };
    throw new Error('Must not load an uninstalled native symbol manager: ' + name);
  } });
  for (let index = 0; index < 4; index++) {
    const icon = exports.TabBarIcon({ index, active: true, color: '#ff0044', size: 22, strokeWidth: 2.2 });
    assert.equal(icon.type, 'LegacyIcon');
    assert.equal(icon.props.index, index);
    assert.equal(icon.props.active, true);
  }
});
