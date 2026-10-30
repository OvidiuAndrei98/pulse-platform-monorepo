import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function mount(platform = 'ios') {
  const slots: any[] = [], effects: (() => void)[] = [], springs: number[] = [], timings: number[] = [];
  let cursor = 0, cancellations = 0, position: any, reduceMotion: ((value: boolean) => void) | undefined;
  const react = {
    useRef(initial: any) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: any) => { slots[i] = value; }]; },
    useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
      const i = cursor++, previous = slots[i];
      if (previous && deps.every((value, n) => Object.is(value, previous.deps[n]))) return;
      effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    },
    useLayoutEffect(effect: () => (() => void) | undefined, deps: unknown[]) { this.useEffect(effect, deps); },
  };
  // Imported hooks are called without a receiver.
  react.useLayoutEffect = react.useEffect;
  const deps: Record<string, any> = {
    react,
    'react-native': { Platform: { OS: platform }, AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: (_: string, fn: (value: boolean) => void) => { reduceMotion = fn; return { remove() {} }; },
    } },
    'react-native-reanimated': {
      useSharedValue: (initial: any) => react.useRef({ value: initial }).current,
      cancelAnimation() { cancellations++; },
      runOnUI: (callback: any) => callback,
      withSpring(target: number) { springs.push(target); return target; },
      withTiming(target: number) { timings.push(target); return target; },
      Easing: { bezier: () => 'easing' },
    },
    './tabCapsuleSpring': { tabCapsuleSpring: {} },
  };
  const exports: any = {};
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/useTabIndicator.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(output, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const render = (index: number, width = 88, enabled = true, gesture?: any) => { cursor = 0; position = exports.useTabIndicator(index, width, enabled, gesture); while (effects.length) effects.shift()!(); return position; };
  return { render, springs, timings, cancellations: () => cancellations,
    reduceMotion: (value: boolean) => reduceMotion?.(value),
    unmount: () => slots.forEach(slot => slot?.cleanup?.()),
  };
}

test('route acknowledgements retarget the running spring without cancelling its velocity', () => {
  const ui = mount();
  const position = ui.render(0);
  position.value = 43;
  ui.render(1);
  assert.equal(ui.cancellations(), 0);
  assert.deepEqual(ui.springs, [88]);
  position.value = 111;
  ui.render(2);
  assert.equal(ui.cancellations(), 0, 'Changing destination must not stop an in-flight spring');
  assert.deepEqual(ui.springs, [88, 176]);
  ui.unmount(); assert.equal(ui.cancellations(), 1);
});

test('reduced motion resolves directly and disabling the animation cancels it', () => {
  const ui = mount(); const position = ui.render(0);
  ui.reduceMotion(true); ui.render(2);
  assert.equal(position.value, 176); assert.deepEqual(ui.springs, []);
  ui.render(2, 88, false); assert.equal(ui.cancellations(), 1);
  ui.unmount();
});

test('Android keeps timed movement and browser movement remains owned by its timeline', () => {
  const android = mount('android'); android.render(0); android.render(1);
  assert.deepEqual(android.timings, [88]); assert.deepEqual(android.springs, []); android.unmount();
  const browser = mount('web'); browser.render(0); browser.render(1);
  assert.deepEqual(browser.timings, []); assert.deepEqual(browser.springs, []); browser.unmount();
});

test('a late page acknowledgement cannot replay an older target over a newer touch', () => {
  const ui = mount(), command = { value: { id: 0, index: 0, pending: false, acknowledgedId: 0 } };
  const position = ui.render(0, 88, true, { command, acknowledged: 0 });
  command.value = { id: 2, index: 3, pending: true, acknowledgedId: 0 };
  position.value = 117;
  ui.render(1, 88, true, { command, acknowledged: 1 });
  assert.equal(position.value, 117); assert.deepEqual(ui.springs, []);
  ui.render(3, 88, true, { command, acknowledged: 1 });
  assert.equal(position.value, 117, 'An older request for the same tab is not the latest acknowledgement');
  ui.render(3, 88, true, { command, acknowledged: 2 });
  assert.equal(position.value, 117, 'Acknowledgement leaves the running UI spring untouched');
  assert.equal(command.value.pending, false); assert.equal(command.value.acknowledgedId, 2);
  ui.render(0, 88, true, { command, acknowledged: 2 });
  assert.deepEqual(ui.springs, [0], 'External navigation still moves the selection');
});

test('same-tab acknowledgement preserves its bounce and resizing still adjusts the target', () => {
  const ui = mount(), command = { value: { id: 0, index: 3, pending: false, acknowledgedId: 0 } };
  const position = ui.render(3, 88, true, { command, acknowledged: 0 });
  command.value = { id: 1, index: 3, pending: true, acknowledgedId: 0 };
  position.value = 270;
  ui.render(3, 88, true, { command, acknowledged: 1 });
  assert.equal(position.value, 270); assert.deepEqual(ui.springs, []);
  ui.render(3, 100, true, { command, acknowledged: 1 });
  assert.deepEqual(ui.springs, [300]);
});
