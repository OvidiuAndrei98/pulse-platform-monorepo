import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
const { hooks, modules, find } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function fixture() {
  const h = hooks(), react = { ...h.react, useLayoutEffect: h.react.useEffect };
  let onUI = false, handlers: Record<string, any> = {};
  const queued: (() => void)[] = [], changes: string[] = [], springs: { target: number; kind: string }[] = [];
  const animated = new Map<any, { target: number; kind: string }>();
  const ui = (fn: (...args: any[]) => any, ...args: any[]) => {
    const previous = onUI; onUI = true;
    try { return fn(...args); } finally { onUI = previous; }
  };
  const shared = (initial: any) => {
    let current = initial;
    const value = {
      get value() { assert.ok(onUI, 'Do not block JS by reading a shared value'); return current; },
      set value(next: any) {
        if (next?.spring) { springs.push(next.spring); animated.set(value, next.spring); }
        else current = next;
      },
    };
    return value;
  };
  const buildTap = () => {
    handlers = {};
    const own = handlers;
    const builder: any = new Proxy({}, { get: (_, name: string) => (arg: any) => { own[name] = arg; return builder; } });
    return builder;
  };
  const { CapsuleSwitchTrack } = modules({
    react,
    'react-native': { Platform: { OS: 'ios' }, View: 'View', Pressable: 'Pressable', StyleSheet: { create: (s: any) => s } },
    'react-native-gesture-handler': { GestureDetector: 'GestureDetector', Gesture: { Tap: buildTap } },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' },
      useSharedValue: (initial: any) => react.useRef(shared(initial)).current,
      useAnimatedStyle: (fn: () => any) => ({ animated: fn }),
      withSpring: (target: number, config: any) => ({ spring: { target, kind: config.kind } }),
      runOnUI: (fn: any) => (...args: any[]) => ui(fn, ...args),
      runOnJS: (fn: any) => (...args: any[]) => { queued.push(() => fn(...args)); },
    },
    '../navigation/tabCapsuleSpring': { tabCapsuleSpring: { kind: 'selection' }, tabCapsulePressSpring: { kind: 'press' }, tabCapsuleReleaseSpring: { kind: 'release' } },
    './theme': { colors: { accent: '#ff0044' } },
  }).load(path.resolve(__dirname, '../src/ui/CapsuleSwitchTrack.tsx'));
  let tree: any;
  const props = { value: 'list', onChange: (value: string) => changes.push(value), width: 144, height: 36, disabled: false,
    indicatorTestID: 'blob', options: [{ value: 'list', label: 'List', content: 'L', testID: 'list' }, { value: 'map', label: 'Map', content: 'M', testID: 'map' }] };
  const render = (next = {}) => { Object.assign(props, next); tree = h.render(() => CapsuleSwitchTrack(props)); };
  render();
  return {
    render, changes, queued, dispose: () => h.unmount(),
    press: (x: number, success = true) => { ui(handlers.onBegin); ui(handlers.onEnd, { x }, success); ui(handlers.onFinalize); },
    option: (id: string) => find(tree, (n: any) => n.props?.testID === id).props,
    blob: () => find(tree, (n: any) => n.props?.testID === 'blob').props,
    style: () => ui(find(tree, (n: any) => n.props?.testID === 'blob').props.style.at(-1).animated),
    selectionSprings: () => springs.filter(s => s.kind === 'selection'),
    advance: (progress: number) => { for (const [value, spring] of animated) if (spring.kind === 'selection') ui(() => { value.value = progress; }); },
    enabled: () => handlers.enabled,
  };
}

test('native switch starts moving before busy JS commits the map and only animates transforms', () => {
  const f = fixture();
  f.press(110);
  assert.deepEqual(f.changes, [], 'React callback is still queued on busy JS');
  assert.deepEqual(f.selectionSprings(), [{ target: 1, kind: 'selection' }], 'UI spring has already started');
  f.advance(.45);
  assert.deepEqual(Object.keys(f.style()), ['transform'], 'No per-frame layout properties');
  assert.equal(f.style().transform[0].translateX, .45 * 72);
  assert.equal(f.blob().style[1].width, '50%');
  f.queued.shift()!();
  f.render({ value: 'list' }); // React is still preparing the destination.
  assert.equal(f.selectionSprings().length, 1);
  f.render({ value: 'map' });
  assert.equal(f.selectionSprings().length, 1, 'React acknowledgement must not restart the moving spring');
  assert.deepEqual(f.changes, ['map']);
  assert.equal(f.option('map').onPress, undefined, 'One native recognizer owns activation');
});

test('rapid native reversals survive stale React renders and out-of-order JS callbacks', () => {
  const f = fixture(); f.press(110); f.advance(.5); f.press(15);
  f.queued.pop()!(); // Latest request reaches JS first.
  f.render({ value: 'map' }); // An older destination renders meanwhile.
  f.queued.shift()!();
  f.render({ value: 'list' });
  assert.deepEqual(f.changes, ['list']);
  assert.deepEqual(f.selectionSprings().map(s => s.target), [1, 0], 'No teleport or spring restart from React');
});

test('native switch preserves accessibility, cancellation, disabled state and unmount safety', () => {
  const f = fixture(); f.press(110, false);
  assert.equal(f.queued.length, 0);
  f.option('map').onAccessibilityTap(); f.queued.shift()!();
  assert.deepEqual(f.changes, ['map']);
  f.render({ value: 'map', disabled: true });
  assert.equal(f.enabled(), false);
  f.option('list').onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
  assert.equal(f.queued.length, 0);
  f.render({ disabled: false }); f.press(15); f.dispose(); f.queued.shift()!();
  assert.deepEqual(f.changes, ['map'], 'An unmounted switch cannot change a page');
});
