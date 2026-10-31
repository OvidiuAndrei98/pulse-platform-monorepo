import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

function scenes() {
  const NativeScreen = React.forwardRef(() => null);
  const ScreenContext = { Provider: 'ScreenContext', value: NativeScreen };
  const react = { ...React,
    createContext: (value: any) => ({ Provider: 'NativeSceneScreenContext', value }),
    useContext: (context: any) => context.value,
  };
  const deps: Record<string, unknown> = {
    react, 'react-native': { View: 'View' },
    'react-native-screens': { InnerScreen: NativeScreen, Screen: NativeScreen, ScreenContext },
  };
  const exports: any = {};
  runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/PersistentTabScenes.ios.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const child = React.createElement('NestedNativeStack');
  const wrapper = exports.PersistentTabScenes({ children: child });
  const Scene = wrapper.props.children.props.value;
  return { NativeScreen, child, render: (props: any, ref: any = null) => Scene.render({ enabled: false, activityState: 0, children: child, ...props }, ref) };
}

test('inactive iOS tab scenes keep their geometry while hiding content, touch and accessibility', () => {
  const ui = scenes(), style = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, ref = { current: null };
  const hidden = ui.render({ style, pointerEvents: 'box-none' }, ref);
  assert.equal(hidden.type, 'View');
  assert.equal(hidden.props.ref, ref);
  assert.equal(hidden.props.style[0], style);
  assert.equal(hidden.props.style[1].opacity, undefined, 'An inactive scene cannot hide native glass beneath zero alpha');
  assert.equal(hidden.props.style[1].zIndex, -1);
  assert.equal(hidden.props.style[1].display, undefined, 'Inactive scenes keep their initial layout');
  assert.equal(hidden.props.pointerEvents, 'none');
  assert.equal(hidden.props.accessibilityElementsHidden, true);
  assert.equal(hidden.props.importantForAccessibility, 'no-hide-descendants');
  const visible = ui.render({ style, activityState: 2, pointerEvents: 'box-none' });
  assert.equal(visible.type, hidden.type, 'Switching tabs keeps the mounted native view');
  assert.equal(visible.props.style[0], style);
  assert.equal(visible.props.style[1].opacity, undefined);
  assert.equal(visible.props.style[1].zIndex, 0);
  assert.equal(visible.props.pointerEvents, 'box-none');
  assert.equal(visible.props.accessibilityElementsHidden, false);
});

test('each scene restores the original Screen for its nested native navigator', () => {
  const ui = scenes();
  for (const activityState of [0, 2]) {
    const scene = ui.render({ activityState });
    assert.equal(scene.props.children.props.value, ui.NativeScreen);
    assert.equal(scene.props.children.props.children, ui.child);
  }
  for (const props of [{ enabled: true }, { isNativeStack: true }, { activityState: undefined }]) {
    assert.equal(ui.render(props).type, ui.NativeScreen, 'Native stacks and animated screens retain the original renderer');
  }
});
