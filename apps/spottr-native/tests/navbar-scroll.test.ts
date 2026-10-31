import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function mount({ focused = true, enabled = true, os = 'ios', connected = true } = {}) {
  const slots: any[] = [], effects: (() => void)[] = [], springs: number[] = [];
  const controller = { compact: { value: 0 }, touchRevision: { current: 0 }, onTouch() { this.touchRevision.current++; } };
  let cursor = 0, handlers: any;
  const listeners = { focus: new Set<() => void>(), blur: new Set<() => void>() };
  const navigation = { isFocused: () => focused, addListener: (name: 'focus' | 'blur', listener: () => void) => {
    listeners[name].add(listener); return () => listeners[name].delete(listener);
  } };
  const deps: Record<string, any> = {
    react: {
      createContext: () => ({}), useContext: () => connected ? controller : null,
      useRef: (initial: any) => slots[cursor++] ??= { current: initial },
      useCallback: (callback: any) => callback,
      useEffect: (effect: () => void, dependencies: unknown[]) => {
        const index = cursor++, previous = slots[index];
        if (!previous || dependencies.some((value, n) => !Object.is(value, previous.dependencies[n]))) effects.push(() => {
          previous?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() };
        });
      },
    },
    'react-native': { Platform: { OS: os } },
    '@react-navigation/native': { useNavigation: () => navigation },
    'react-native-reanimated': { withSpring: (target: number) => { springs.push(target); return target; } },
    './tabCapsuleSpring': { tabCapsulePickupSpring: {} },
  };
  const exports: any = {};
  const js = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/useNavbarScroll.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(js, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const render = (next: { focused?: boolean; enabled?: boolean } = {}) => {
    focused = next.focused ?? focused; enabled = next.enabled ?? enabled;
    cursor = 0; handlers = exports.useNavbarScroll(enabled);
    while (effects.length) effects.shift()!();
  };
  render();
  return { controller, springs, render, handlers: () => handlers,
    focus(next: boolean) { focused = next; for (const listener of listeners[next ? 'focus' : 'blur']) listener(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); }, listeners,
  };
}

const event = (y: number) => ({ nativeEvent: {
  contentOffset: { x: 0, y }, contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
  contentSize: { width: 390, height: 1000 }, layoutMeasurement: { width: 390, height: 400 },
} });

test('downward scrolling compacts once and a deliberate reversal restores the navbar', () => {
  const ui = mount(), scroll = ui.handlers();
  scroll.onScrollBeginDrag(event(0)); scroll.onScroll(event(8));
  assert.equal(ui.controller.compact.value, 0);
  scroll.onScroll(event(24)); assert.equal(ui.controller.compact.value, 1);
  scroll.onScroll(event(50)); scroll.onScroll(event(100));
  assert.deepEqual(ui.springs, [0, 1], 'The running spring is not restarted per scroll frame');
  scroll.onScroll(event(96)); assert.equal(ui.controller.compact.value, 1);
  scroll.onScroll(event(85)); assert.equal(ui.controller.compact.value, 0);
});

test('scroll bounce and refresh pulls do not toggle the navbar', () => {
  const ui = mount(), scroll = ui.handlers();
  scroll.onScrollBeginDrag(event(0));
  for (const y of [-60, -40, -5, 0]) scroll.onScroll(event(y));
  assert.equal(ui.controller.compact.value, 0);
  scroll.onScrollBeginDrag(event(500)); scroll.onScroll(event(580));
  assert.equal(ui.controller.compact.value, 1);
  for (const y of [620, 650, 630, 600, 598]) scroll.onScroll(event(y));
  assert.equal(ui.controller.compact.value, 1, 'Bottom bounce is not upward reading');
});

test('touching the navbar overrides old momentum until a new scroll gesture', () => {
  const ui = mount(), scroll = ui.handlers();
  scroll.onScrollBeginDrag(event(0)); scroll.onScroll(event(30));
  scroll.onScrollEndDrag(); scroll.onMomentumScrollBegin();
  ui.controller.onTouch(); ui.controller.compact.value = 0;
  scroll.onScroll(event(100)); scroll.onScroll(event(180));
  scroll.onMomentumScrollBegin(); scroll.onScroll(event(240));
  assert.equal(ui.controller.compact.value, 0);
  scroll.onScrollBeginDrag(event(240)); scroll.onScroll(event(270));
  assert.equal(ui.controller.compact.value, 1);
});

test('programmatic offsets do not compact; momentum belongs to a real drag', () => {
  const ui = mount(), scroll = ui.handlers();
  scroll.onScroll(event(200)); scroll.onMomentumScrollBegin(); scroll.onScroll(event(300));
  assert.equal(ui.controller.compact.value, 0);
  scroll.onScrollBeginDrag(event(0)); scroll.onScroll(event(10)); scroll.onScrollEndDrag();
  scroll.onMomentumScrollBegin(); scroll.onScroll(event(40));
  assert.equal(ui.controller.compact.value, 1);
  scroll.onMomentumScrollEnd(); scroll.onScroll(event(0));
  assert.equal(ui.controller.compact.value, 1);
});

test('focus changes discard old events and map mode restores the full navbar', () => {
  const ui = mount(), previous = ui.handlers();
  previous.onScrollBeginDrag(event(0)); previous.onScroll(event(30));
  ui.focus(false); previous.onScroll(event(100));
  ui.focus(true);
  assert.equal(ui.controller.compact.value, 0);
  previous.onScroll(event(200)); assert.equal(ui.controller.compact.value, 0);
  ui.handlers().onScrollBeginDrag(event(0)); ui.handlers().onScroll(event(40));
  assert.equal(ui.controller.compact.value, 1);
  ui.render({ enabled: false });
  ui.handlers().onScrollBeginDrag(event(0)); ui.handlers().onScroll(event(80));
  assert.equal(ui.controller.compact.value, 0);
});

test('focus subscriptions are released and refreshed without duplicating scroll reactions', () => {
  const ui = mount();
  assert.equal(ui.listeners.focus.size, 1); assert.equal(ui.listeners.blur.size, 1);
  ui.render({ enabled: false });
  assert.equal(ui.listeners.focus.size, 1); assert.equal(ui.listeners.blur.size, 1);
  ui.unmount();
  assert.equal(ui.listeners.focus.size, 0); assert.equal(ui.listeners.blur.size, 0);
});

test('other platforms and screens without a navbar controller remain unaffected', () => {
  for (const options of [{ os: 'android' }, { os: 'web' }, { connected: false }]) {
    const ui = mount(options), scroll = ui.handlers();
    scroll.onScrollBeginDrag(event(0)); scroll.onScroll(event(60));
    assert.equal(ui.controller.compact.value, 0);
    assert.equal(ui.springs.length, 0);
  }
});
