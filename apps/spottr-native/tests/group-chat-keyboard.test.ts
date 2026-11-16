import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

const animatedStyles = new WeakMap<object, () => unknown>();
const animatedStyle = (callback: () => unknown) => {
  const style = {};
  animatedStyles.set(style, callback);
  return style;
};
const flatten = (value: any): any => {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten));
  if (value && typeof value === 'object' && animatedStyles.has(value)) {
    return flatten(animatedStyles.get(value)!());
  }
  return value ?? {};
};

function fixture(bottomInset: number) {
  const keyboard = { height: { value: 0 }, progress: { value: 0 } };
  const contexts: any[] = [];
  const react = {
    ...React,
    createContext(initial: unknown) {
      const context = { value: initial, Provider: 'ComposerHeightProvider' };
      contexts.push(context);
      return context;
    },
    useContext: (context: any) => context.value,
    useMemo: (callback: () => unknown) => callback(),
  };
  const interpolate = (value: number, input: number[], output: number[]) =>
    output[0]! + (value - input[0]!) / (input[1]! - input[0]!) * (output[1]! - output[0]!);
  const deps: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'NativeAnimatedView' }, interpolate,
      useSharedValue: (value: number) => ({ value }),
      useAnimatedStyle: animatedStyle,
    },
    '../../hooks': { useReanimatedKeyboardAnimation: () => keyboard },
    '../../reanimated': { useAnimatedStyle: animatedStyle },
  };
  const load = (file: string): any => {
    const exports: any = {};
    const output = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {
        jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS,
        esModuleInterop: true, target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    runInNewContext(output, { exports, require(name: string) {
      if (!(name in deps)) throw Error('Unexpected dependency in keyboard fixture: ' + name);
      return deps[name];
    } });
    return exports;
  };
  const libraryRoot = resolve(__dirname, '../node_modules/react-native-keyboard-controller/src');
  // Run the installed StickyView and height compensation helper, rather than
  // substituting a second copy of Spottr's keyboard transform in the test.
  const sticky = load(resolve(libraryRoot, 'components/KeyboardStickyView/index.tsx')).default;
  const geometry = load(resolve(libraryRoot, 'components/KeyboardChatScrollView/useChatKeyboard/helpers.ts'));
  const appGeometry = load(resolve(__dirname, '../src/groups/groupChatGeometry.ts'));
  deps['./groupChatGeometry'] = appGeometry;
  deps['react-native-keyboard-controller'] = {
    KeyboardStickyView: sticky, KeyboardChatScrollView: 'KeyboardChatScrollView',
    useReanimatedKeyboardAnimation: () => keyboard,
  };
  const app = load(resolve(__dirname, '../src/groups/GroupChatKeyboard.native.tsx'));
  const provider = app.GroupChatKeyboardProvider({ bottomInset, children: null });
  contexts[0].value = provider.props.value;
  let viewportInset = 0;
  const list = app.GroupChatScrollView.render({ bottomInset, keyboardDismissMode: 'interactive',
    onViewportInset: (value: number) => { viewportInset = value; },
  }, null);
  const dock = app.GroupComposerDock({ bottomInset, children: React.createElement('Composer') });
  return {
    list, dock, geometry, appGeometry,
    hiddenList: () => app.GroupChatScrollView.render({ bottomInset, active: false, onViewportInset: (value: number) => { viewportInset = value; } }, null),
    hiddenDock: () => app.GroupComposerDock({ bottomInset, active: false, children: React.createElement('Composer') }),
    get viewportInset() { return viewportInset; },
    layout(height: number) { dock.props.onLayout({ nativeEvent: { layout: { height } } }); },
    frame(height: number, progress: number) {
      keyboard.height.value = -height;
      keyboard.progress.value = progress;
      const rendered = sticky.render(dock.props, null);
      return {
        sticky: flatten(rendered.props.style),
        wrapper: flatten(rendered.props.children.props.style),
      };
    },
  };
}

test('native composer uses the installed sticky driver for opening, interactive dismissal and cancellation', () => {
  for (const bottomInset of [12, 34]) {
    const f = fixture(bottomInset), reserved = f.list.props.extraContentPadding;
    f.layout(54 + bottomInset);
    assert.equal(f.list.props.inverted, true);
    assert.equal(f.list.props.automaticallyAdjustKeyboardInsets, false);
    assert.equal(f.list.props.automaticallyAdjustContentInsets, false);
    assert.equal(f.list.props.contentInsetAdjustmentBehavior, 'never');
    assert.equal(f.list.props.keyboardDismissMode, 'interactive');
    assert.equal(f.dock.props.offset.opened, f.list.props.offset,
      'The composer and list must agree about the effective keyboard distance');

    const stages = [0, 0.2, 0.7, 1, 0.8, 0.35, 0.15, 0.55, 1, 0.6, 0];
    for (const progress of stages) {
      const height = 300 * progress, style = f.frame(height, progress).sticky;
      const translate = style.transform[0].translateY;
      assert.equal(style.position, 'absolute');
      assert.equal(style.bottom, 0);
      assert.equal(style.height, undefined, 'Keyboard motion must not resize the composer container');
      assert.equal(f.list.props.extraContentPadding, reserved,
        'Keyboard frames must keep the same shared composer reservation');
      // The actual controls sit above the row's stable bottom safe padding.
      const keyboardTop = 874 - height;
      const controlsBottom = 874 + translate - bottomInset;
      const gap = keyboardTop - controlsBottom;
      assert.ok(gap >= Math.min(bottomInset, 16) - 1e-6,
        `Controls crossed the keyboard touch boundary at progress ${progress}`);
      assert.ok(gap <= Math.max(bottomInset, 16) + 1e-6,
        'Safe-area compensation must not introduce an extra keyboard jump');
      if (progress === 0) assert.equal(translate, 0, 'A completed or cancelled gesture must leave no residual offset');
      if (progress === 1) assert.ok(Math.abs(gap - 16) < 1e-6,
        'Open keyboard must preserve the requested 16pt gap, including on Android with a 12pt closed inset');
    }
  }
});

test('covered chat freezes keyboard adjustment and ignores zero or hidden dock measurements', () => {
  const f = fixture(34), reserved = f.list.props.extraContentPadding;
  f.layout(122);f.layout(0);assert.equal(reserved.value,122,'Detaching a native route must not erase its composer reservation');
  const hidden=f.hiddenDock();hidden.props.onLayout({nativeEvent:{layout:{height:0}}});hidden.props.onLayout({nativeEvent:{layout:{height:44}}});
  assert.equal(reserved.value,122,'A covered route cannot replace its last real dock measurement');
  const list=f.hiddenList();assert.equal(list.props.freeze,true);
  list.props.onContentInsetChange({top:0,bottom:0,left:0,right:0});assert.equal(f.viewportInset,0);
  f.list.props.onContentInsetChange({top:360,bottom:0,left:0,right:0});
  list.props.onContentInsetChange({top:0,bottom:0,left:0,right:0});assert.equal(f.viewportInset,360,'Hidden inset callbacks must not overwrite the visible viewport');
});

test('multiline growth reserves the complete native dock without hiding the latest reachable message', () => {
  for (const bottomInset of [12, 34]) {
    const f = fixture(bottomInset), sharedHeight = f.list.props.extraContentPadding;
    for (const height of [88, 122, 164, 88]) {
      f.layout(height);
      assert.equal(sharedHeight.value, height, 'Measured multiline/error dock must update the existing reservation');
      for (const keyboardHeight of [0, 300]) {
        const progress = keyboardHeight ? 1 : 0;
        const translation = f.frame(keyboardHeight, progress).sticky.transform[0].translateY;
        const inset = f.geometry.getEffectiveHeight(keyboardHeight, 300, f.list.props.offset);
        const reachableMessageBottom = 874 - sharedHeight.value - inset;
        const composerTop = 874 - height + translation;
        assert.ok(reachableMessageBottom <= composerTop + 1e-6,
          'Latest message must remain reachable above the absolute composer, including after multiline shrink and negative Android compensation');
      }
    }
  }
});

test('native composer width follows the same live keyboard progress without scaling text or icons', () => {
  const f = fixture(34);
  const widths = new Map<number, number>();
  for (const progress of [0, 0.25, 0.5, 0.8, 1, 0.6, 0.25, 0.5, 1, 0]) {
    const style = f.frame(300 * progress, progress).wrapper;
    const gutter = style.paddingHorizontal;
    assert.equal(style.transform, undefined, 'Width must change through layout gutters, not scale the input contents');
    assert.equal(style.height, undefined, 'Width animation must not impose a second composer height');
    assert.ok(gutter >= 14 && gutter <= 24, 'Animated gutters must remain within the reference proportions');
    if (progress === 0) assert.equal(gutter, 24);
    if (progress === 1) assert.equal(gutter, 14);
    if (progress > 0 && progress < 1) assert.ok(gutter > 14 && gutter < 24,
      'Interactive frames must not wait for a keyboard-open boolean');
    if (widths.has(progress)) assert.equal(gutter, widths.get(progress),
      'Cancelling or reversing a drag must restore the width for the same native progress');
    widths.set(progress, gutter);
  }
  assert.equal(f.dock.props.children.props.children.type, 'Composer',
    'The measured dock should wrap the existing composer rather than replace its content');
});

test('inverted native read distance includes the real composer/keyboard inset', () => {
  const f = fixture(34);
  f.list.props.onContentInsetChange({ top: 360, bottom: 0, left: 0, right: 0 });
  assert.equal(f.viewportInset, 360, 'Android synthetic inset must reach the screen read guard');
  const distance = f.appGeometry.distanceFromLatest(-160, f.viewportInset);
  assert.equal(distance, 200);
  assert.equal(distance < 70, false, 'A negative raw offset must not mark covered or older messages read');
  assert.equal(f.appGeometry.distanceFromLatest(-360, f.viewportInset), 0);
  assert.equal(f.appGeometry.distanceFromLatest(-310, f.viewportInset) < 70, true);
  assert.equal(f.appGeometry.distanceFromLatest(-290, f.viewportInset) < 70, false);
  assert.equal(f.appGeometry.distanceFromLatest(-410, f.viewportInset), 0,
    'Overscroll beyond the latest message must not become a negative distance');
  assert.equal(f.appGeometry.distanceFromLatest(200, 0), 200,
    'Web without a native inset keeps ordinary inverted-list distance');
});
