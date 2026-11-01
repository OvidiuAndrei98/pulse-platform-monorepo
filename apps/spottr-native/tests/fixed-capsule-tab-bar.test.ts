import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

const elements = (node: any): any[] => Array.isArray(node) ? node.flatMap(elements) : React.isValidElement(node) ? [node, ...elements((node.type as any)?.type?.name === 'FixedTabIndicator' ? (node.type as any).type(node.props) : (node.props as any).children)] : [];
type Motion = { position: { value: number }; interaction: { value: number }; edgeResponse?: { value: number }; edgeDirection?: { value: number }; gestureCommand?: { value: { id: number; index: number; pending: boolean; acknowledgedId: number } }; itemWidth: number; measure: (value: number) => void; timeline: { current: null } };

function mount({ prevented = false, roleRouting = false, activeIndex = 0, indicatorMotion, deferPickup = false, deferFollow = false, deferSelection = false, scrollCompact = 0 }: { prevented?: boolean; roleRouting?: boolean; activeIndex?: number; indicatorMotion?: Motion; deferPickup?: boolean; deferFollow?: boolean; deferSelection?: boolean; scrollCompact?: number } = {}) {
  const slots: any[] = [], effects: (() => void)[] = [], shared: { value: any }[] = [];
  const events: any[] = [], navigations: any[] = [], selections: string[] = [], springs: any[] = [];
  const impacts: number[] = [];
  const scrollController = { compact: { value: scrollCompact }, touches: 0, onTouch() { this.touches++; } };
  scrollController.onTouch = () => { scrollController.touches++; };
  const reactions: { prepare: () => any; react: (value: any, previous: any) => void; previous: any }[] = [];
  const pending = new Map<any, { from: number; target: number }>();
  const flushReactions = () => {
    for (const reaction of reactions) {
      const value = reaction.prepare(), previous = reaction.previous;
      if (Object.is(value, previous)) continue;
      reaction.previous = value; reaction.react(value, previous);
    }
  };
  const sharedValue = (initial: any) => {
    let current = initial;
    const value = {
      get value() { return current; },
      set value(next: any) {
        if (next?.deferredSpring) pending.set(value, { from: current, target: next.target });
        else { pending.delete(value); current = next; }
      },
    };
    return value;
  };
  let cursor = 0, tree: any, pan: any;
  const memo = (factory: () => any, deps: unknown[]) => {
    const index = cursor++, previous = slots[index];
    if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) slots[index] = { deps, value: factory() };
    return slots[index].value;
  };
  const react = { ...React,
    useMemo: memo,
    useCallback: (callback: any, deps: unknown[]) => memo(() => callback, deps),
    useContext: () => scrollController,
    useRef: (value: any) => { const i = cursor++; return slots[i] ??= { current: value }; },
    useState: (initial: any) => {
      const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value: any) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useLayoutEffect: (effect: () => void, deps: unknown[]) => {
      const i = cursor++, previous = slots[i]; slots[i] = deps;
      if (!previous || deps.some((value, n) => !Object.is(value, previous[n]))) effects.push(effect);
    },
  };
  const props: any = { activeIndex, indicatorMotion, insets: { bottom: 34 },
    state: { index: activeIndex, routes: ['Home', 'Explore', 'Feed', 'Profile'].map(name => ({ name, key: name + '-key', params: { retained: true } })) },
    navigation: { emit: (event: any) => { events.push(event); return { defaultPrevented: prevented }; }, navigate: (...args: any[]) => navigations.push(args) },
    ...(roleRouting ? { onSelectTab: (name: string) => { selections.push(name); return !prevented; } } : {}),
  };
  const buildGesture = (type: string) => {
    const handlers: Record<string, any> = {};
    const builder: any = new Proxy({}, { get: (_, key: string) => key === 'testHandlers' ? handlers : (...args: any[]) => {
      handlers[key] = typeof args[0] === 'function' ? (...event: any[]) => { args[0](...event); flushReactions(); } : args[0];
      return builder;
    } });
    if (type === 'pan') pan = handlers;
    return builder;
  };
  const deps: Record<string, any> = {
    react,
    'react-native': { View: 'View', StyleSheet: { create: (style: any) => style } },
    'react-native-gesture-handler': { GestureDetector: 'GestureDetector', Gesture: {
      Pan: () => buildGesture('pan'), Tap: () => buildGesture('tap'), Exclusive: (...gestures: any[]) => ({ exclusive: gestures }),
    } },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' },
      useSharedValue: (initial: any) => { const value = react.useRef(sharedValue(initial)).current; if (!shared.includes(value)) shared.push(value); return value; },
      useAnimatedReaction: (prepare: () => any, effect: (value: any, previous: any) => void) => {
        const reaction = react.useRef({ prepare, react: effect, previous: null }).current;
        Object.assign(reaction, { prepare, react: effect });
        if (!reactions.includes(reaction)) reactions.push(reaction);
      },
      useAnimatedStyle: (style: () => any) => new Proxy({}, { get: (_, key) => style()[key] }),
      useDerivedValue: (derive: () => any) => ({ get value() { return derive(); } }),
      withSpring: (target: number, config: any) => {
        springs.push({ target, config });
        return (deferPickup && config.kind === 'pickup') || (deferFollow && config.kind === 'follow') || (deferSelection && config.kind === 'selection') ? { deferredSpring: true, target } : target;
      },
      withTiming: (target: number) => { if (target !== 0) impacts.push(target); return target; },
      // Hold an impact at its peak so its deformation can be inspected.
      withSequence: (...values: any[]) => values[0],
      cancelAnimation: (value: any) => { pending.delete(value); }, runOnJS: (fn: any) => fn, runOnUI: (fn: any) => fn,
    },
    '../usePreferences': { usePreferences: () => ({ copy: (key: string) => key }) },
    '../ui/theme': { colors: { accent: '#ff0044' } },
    '../ui/ToastHost': { ToastHost: 'ToastHost' }, './TabBarIcon': { TabBarIcon: 'Icon' }, './TabBarSurface': { TabBarSurface: 'Surface' },
    './TabBarIndicatorSurface': { TabBarIndicatorSurface: 'IndicatorSurface' },
    './useNavbarScroll': { NavbarScrollContext: {}, navbarCompactScale: 0.83 },
    './tabCapsuleSpring': { withTabTravel: (target: number) => deps['react-native-reanimated'].withSpring(target, { kind: 'selection' }), tabCapsuleFollowSpring: { kind: 'follow' }, tabCapsuleImpactTiming: {}, tabCapsulePickupSpring: { kind: 'pickup' }, tabCapsulePressSpring: { kind: 'press' }, tabCapsuleReleaseSpring: { kind: 'release' } },
  };
  const exports: any = {};
  const js = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/FixedCapsuleTabBar.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  runInNewContext(js, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const render = (next: Record<string, unknown> = {}) => { Object.assign(props, next); cursor = 0; tree = exports.FixedCapsuleTabBar(props); while (effects.length) effects.shift()!(); flushReactions(); };
  const find = (id: string) => elements(tree).find(element => element.props.testID === id);
  render();
  elements(tree).find(element => element.props.onLayout)?.props.onLayout({ nativeEvent: { layout: { width: 360 } } });
  render();
  const advanceSprings = (progress: number) => {
    for (const [value, animation] of [...pending]) {
      value.value = animation.from + (animation.target - animation.from) * progress;
      if (progress < 1) pending.set(value, animation);
    }
    flushReactions();
  };
  return { render, find, events, navigations, selections, springs, impacts, scrollController,
    position: indicatorMotion?.position ?? shared[0]!, interaction: indicatorMotion?.interaction ?? shared[1]!,
    edgeResponse: indicatorMotion?.edgeResponse ?? shared[2]!,
    advancePickup: advanceSprings, advanceSprings,
    pan: () => pan, tap: (index = 0) => elements(tree).find(element => element.type === 'GestureDetector' && element.props.children.props.testID === `tab-${props.state.routes[index].name}`).props.gesture.testHandlers, elements: () => elements(tree),
    transform: () => find('tab-indicator').props.style[2].transform,
    barTransform: () => find('tab-bar-motion').props.style[1].transform,
    glassWidth: () => find('tab-bar-motion').props.style[0].width * find('tab-bar-motion').props.style[1].transform[1].scaleX,
    trackWidth: () => find('tab-track').props.style[1].width,
    trackTransform: () => find('tab-track').props.style[2].transform,
    compactTransform: () => find('tab-compact-motion').props.style.transform,
    x: () => find('tab-indicator').props.style[2].transform[0].translateX,
  };
}

test('hidden native navbar disables gestures and rejects a callback queued before hiding', () => {
  const ui = mount({ roleRouting: true });
  const queuedTap = ui.tap(3);
  assert.equal(queuedTap.enabled, true);
  ui.render({ interactionEnabled: false });
  assert.equal(ui.pan().enabled, false);
  assert.equal(ui.tap().enabled, false);
  queuedTap.onEnd({ x: 314 }, true);
  ui.find('tab-Profile').props.onAccessibilityTap();
  assert.deepEqual(ui.selections, []);
  assert.deepEqual(ui.events, []);
  ui.render({ interactionEnabled: true });
  assert.equal(ui.pan().enabled, true);
  assert.equal(ui.tap().enabled, true);
  ui.tap(1).onEnd({ x: 132 }, true);
  assert.deepEqual(ui.selections, ['Explore']);
});

test('a background navbar follows the shared blob without restarting the foreground edge spring', () => {
  const shared: Motion = { position: { value: 88 }, interaction: { value: 0 }, edgeResponse: { value: 0 }, edgeDirection: { value: 1 }, itemWidth: 88, measure() {}, timeline: { current: null } };
  const ui = mount({ indicatorMotion: shared, activeIndex: 1 });
  ui.render({ interactionEnabled: false });
  shared.position.value = 264;
  ui.render({ interactionEnabled: false, activeIndex: 3 });
  assert.equal(ui.x(), 264, 'The returning scene already displays the shared position');
  assert.equal(ui.impacts.length, 0, 'An offscreen copy must not write a competing shared animation');
  assert.equal(shared.edgeResponse!.value, 0);
  ui.render({ interactionEnabled: true });
  assert.equal(ui.x(), 264, 'Focus handoff does not snap or replay the movement');
  assert.equal(ui.impacts.length, 0);
});

test('an already accepted UI tap survives a rapid scene handoff before its JS callback runs', () => {
  const motion: Motion = { position: { value: 0 }, interaction: { value: 0 }, gestureCommand: { value: { id: 0, index: 0, pending: false, acknowledgedId: 0 } }, itemWidth: 88, measure() {}, timeline: { current: null } };
  const ui = mount({ roleRouting: true, indicatorMotion: motion });
  const acceptedTap = ui.tap(1);
  ui.render({ interactionEnabled: false });
  acceptedTap.onEnd({ x: 132 }, true);
  assert.deepEqual(ui.selections, ['Explore'], 'Route eligibility is checked by the current provider, not the old scene');
  ui.find('tab-Profile').props.onAccessibilityTap();
  assert.deepEqual(ui.selections, ['Explore'], 'New touches on a hidden bar remain blocked');
});

test('a drag selects once, and a failed tap cannot navigate back to its starting tab', () => {
  const ui = mount();
  ui.pan().onBegin(); ui.pan().onStart({ x: 142, translationX: 10 });
  ui.pan().onUpdate({ translationX: 88 });
  assert.equal(ui.events.length, 0);
  ui.pan().onEnd({ velocityX: 20000 }, true); ui.pan().onFinalize();
  ui.tap().onEnd({ x: 132 }, false);
  assert.equal(ui.events.length, 1);
  assert.equal(ui.navigations[0][0], 'Feed');
  assert.equal(ui.navigations[0][1].retained, true);
  assert.equal(ui.find('tab-Explore').props.onPress, undefined, 'No competing child touch handler');
  const detector = ui.elements().find(element => element.type === 'GestureDetector');
  for (const index of [0, 1, 2, 3]) assert.equal(ui.tap(index).requireExternalGestureToFail, detector.props.gesture);
});

test('an accepted tap stays at its target while navigation publishes the new route later', () => {
  const ui = mount({ roleRouting: true });
  ui.pan().onBegin(); ui.pan().onFinalize(); ui.tap(2).onEnd({ x: 220 }, true);
  assert.equal(ui.x(), 176); assert.deepEqual(ui.selections, ['Feed']);
  ui.render(); assert.equal(ui.x(), 176, 'No acknowledgement springs back to the old route');
  ui.render({ activeIndex: 2 }); assert.equal(ui.x(), 176);
});

test('a page selection is published while the capsule is still travelling', () => {
  const ui = mount({ roleRouting: true, deferSelection: true });
  ui.pan().onBegin(); ui.pan().onFinalize(); ui.tap(3).onEnd({ x: 314 }, true);
  assert.equal(ui.position.value, 0, 'The spring has not reached its destination');
  assert.deepEqual(ui.selections, ['Profile'], 'The page does not wait for arrival');
  ui.advancePickup(0.5);
  assert.equal(ui.position.value, 132);
  assert.equal(ui.selections.length, 1);
});

test('a tap starts one trip on release without previewing another tab on touch down', () => {
  const ui = mount({ roleRouting: true, deferSelection: true });
  const trips = () => ui.springs.filter(spring => spring.config.kind === 'selection').length;
  const before = trips();
  ui.pan().onBegin({ x: 314 });
  assert.equal(trips(), before);
  assert.equal(ui.position.value, 0);
  assert.deepEqual(ui.selections, []);
  ui.pan().onFinalize(); ui.tap(3).onEnd({ x: 314 }, true);
  assert.deepEqual(ui.selections, ['Profile']);
  assert.equal(trips(), before + 1);
  ui.advanceSprings(0.4);
  assert.ok(Math.abs(ui.position.value - 105.6) < 0.001);
});

test('a cancelled touch leaves the current tab and capsule position unchanged', () => {
  const ui = mount({ roleRouting: true });
  ui.pan().onBegin({ x: 314 });
  assert.equal(ui.position.value, 0);
  ui.pan().onFinalize(); ui.tap().onEnd({ x: 314 }, false);
  assert.equal(ui.position.value, 0);
  assert.deepEqual(ui.selections, []);
});

test('acknowledging a previous tap does not cancel the next finger movement', () => {
  const motion: Motion = { position: { value: 0 }, interaction: { value: 0 }, gestureCommand: { value: { id: 1, index: 1, pending: false, acknowledgedId: 1 } }, itemWidth: 88, measure() {}, timeline: { current: null } };
  const ui = mount({ roleRouting: true, indicatorMotion: motion });
  ui.pan().onBegin();
  ui.pan().onStart({ x: 220, translationX: 0 });
  // React publishes the previous Explore tap after the next gesture began.
  ui.render({ activeIndex: 1 });
  ui.pan().onUpdate({ translationX: 88 });
  ui.pan().onEnd({}, true); ui.pan().onFinalize();
  assert.deepEqual(ui.selections, ['Profile'], 'The latest touch must still select its destination');
  assert.equal(motion.gestureCommand!.value.id, 2);
  assert.equal(motion.gestureCommand!.value.index, 3);
});

test('page acknowledgement keeps the same native gesture recognizers and cancellation reads the current tab', () => {
  const ui = mount();
  const detector = () => ui.elements().find(element => element.type === 'GestureDetector').props.gesture;
  const gesture = detector();
  ui.render({ activeIndex: 3 });
  assert.equal(detector(), gesture, 'A page change must not replace the active gesture detector');
  ui.pan().onStart({ x: 310, translationX: -8 });
  ui.pan().onEnd({}, false); ui.pan().onFinalize();
  ui.edgeResponse.value = 0;
  assert.equal(ui.x(), 264, 'The stable handlers restore the new controlled tab');
});

test('different tabs own separate native tap targets throughout rapid reversals', () => {
  const ui = mount({ roleRouting: true });
  const recognizers = [0, 1, 2, 3].map(index => ui.tap(index));
  assert.equal(new Set(recognizers).size, 4, 'Two tab contacts must not share one tap recognizer');
  const requested = Array.from({ length: 100 }, (_, n) => n % 2 ? 3 : 0);
  for (const index of requested) {
    // A failed surrounding pan must not block an independently recognized tap.
    ui.pan().onBegin(); ui.pan().onFinalize();
    ui.tap(index).onEnd({ x: 20 }, true);
    ui.render({ activeIndex: index });
    for (let tab = 0; tab < 4; tab++) assert.equal(ui.tap(tab), recognizers[tab]);
  }
  assert.deepEqual(ui.selections, requested.map(index => index === 0 ? 'Home' : 'Profile'));
  assert.equal(ui.position.value, 264);
});

test('picking up an in-flight capsule centers smoothly and resists travel past both ends', () => {
  const ui = mount({ deferPickup: true }); ui.position.value = 38;
  ui.pan().onStart({ x: 58, translationX: 8 });
  assert.equal(ui.x(), 38, 'The new grip does not teleport an in-flight capsule');
  ui.advancePickup(0.5);
  assert.equal(ui.x(), 24, 'The center moves progressively toward the finger');
  ui.advancePickup(1);
  assert.equal(ui.x() + 48, 58);
  ui.pan().onUpdate({ translationX: 12 }); assert.equal(ui.x(), 14);
  ui.pan().onUpdate({ translationX: 2000 }); assert.ok(ui.x() > 264 && ui.x() < 280);
  ui.pan().onUpdate({ translationX: -2000 }); assert.ok(ui.x() < 0 && ui.x() > -16);
  ui.pan().onEnd({}, true);
  assert.equal(ui.events.length, 1); assert.equal(ui.navigations.length, 0);
  ui.edgeResponse.value = 0;
  ui.position.value = -6; assert.equal(ui.x(), -6);
  ui.pan().onStart({ x: 45, translationX: 1 });
  const heldX = ui.x();
  ui.pan().onUpdate({ translationX: 3 });
  assert.ok(ui.x() > heldX && ui.x() < 0, 'An edge pickup moves back without a hard jump to zero');
});

test('grabbing either side of the selected capsule brings its center under the finger', () => {
  for (const [x, initialTranslation, translationX] of [[100, 5, 35], [172, -5, -35]] as const) {
    const ui = mount({ activeIndex: 1, deferPickup: true });
    ui.pan().onBegin(); ui.pan().onStart({ x, translationX: initialTranslation });
    assert.equal(ui.position.value, 88, 'Pickup begins at the displayed position');
    ui.advancePickup(0.5);
    const intermediateCenter = ui.x() + 48;
    assert.ok(intermediateCenter > Math.min(136, x) && intermediateCenter < Math.max(136, x));
    ui.advancePickup(1);
    assert.equal(ui.x() + 48, x, 'The original grip offset disappears');
    ui.pan().onUpdate({ translationX });
    assert.equal(ui.x() + 48, x - initialTranslation + translationX, 'The settled follow spring centers on the moving finger');
    assert.equal(ui.events.length, 0, 'Centering alone does not change pages');
  }
});

test('holding another tab brings the capsule under the finger progressively', () => {
  const ui = mount({ deferPickup: true });
  ui.pan().onStart({ x: 230, translationX: 10 });
  assert.equal(ui.x(), 0, 'Starting on Feed keeps the current Home position');
  ui.advancePickup(0.5);
  assert.ok(ui.x() > 0 && ui.x() < 182, 'Pickup has an intermediate frame');
  ui.advancePickup(1);
  assert.equal(ui.x(), 182);
  ui.pan().onUpdate({ translationX: 20 });
  assert.equal(ui.x(), 192, 'After pickup the settled follow spring reaches the finger target');
  assert.equal(ui.events.length, 0, 'Dragging does not select before release');
});

test('held movement follows through the spring and reverses from its displayed position', () => {
  const ui = mount({ activeIndex: 1, deferFollow: true });
  ui.pan().onStart({ x: 136, translationX: 0 });
  ui.pan().onUpdate({ translationX: 70 });
  assert.equal(ui.position.value, 88, 'Moving the finger does not teleport the capsule');
  assert.equal(ui.springs.at(-1).target, 158);
  assert.equal(ui.springs.at(-1).config.kind, 'follow');
  ui.advanceSprings(0.5);
  assert.equal(ui.position.value, 123, 'The capsule has a visible intermediate position');
  ui.pan().onUpdate({ translationX: -30 });
  assert.equal(ui.position.value, 123, 'Reversal starts from the displayed position');
  assert.equal(ui.springs.at(-1).target, 58);
  ui.advanceSprings(0.5);
  assert.ok(ui.position.value < 123 && ui.position.value > 58);
  assert.equal(ui.events.length, 0, 'Following alone does not change pages');
});

test('a quick release selects the finger target even while the follow spring lags behind', () => {
  const ui = mount({ deferFollow: true });
  ui.pan().onStart({ x: 48, translationX: 0 });
  ui.pan().onUpdate({ translationX: 260 });
  assert.equal(ui.position.value, 0);
  ui.pan().onEnd({}, true); ui.pan().onFinalize();
  assert.equal(ui.navigations[0][0], 'Profile');
  ui.advanceSprings(1);
  assert.equal(ui.position.value, 264, 'Old following cannot replace the selected tab');
  assert.equal(ui.events.length, 1);
});

test('external navigation cancels a lagging follow without a late drag selection', () => {
  const ui = mount({ deferFollow: true });
  ui.pan().onStart({ x: 48, translationX: 0 });
  ui.pan().onUpdate({ translationX: 200 });
  ui.advanceSprings(0.3);
  const running = ui.pan();
  ui.render({ activeIndex: 1 });
  ui.advanceSprings(1);
  running.onUpdate({ translationX: 264 }); running.onEnd({}, true);
  assert.equal(ui.position.value, 88);
  assert.equal(ui.events.length, 0);
});

test('releasing during pickup selects the finger target rather than the lagging capsule', () => {
  const ui = mount({ deferPickup: true });
  ui.pan().onStart({ x: 230, translationX: 10 });
  assert.equal(ui.x(), 0);
  ui.pan().onEnd({}, true); ui.pan().onFinalize();
  assert.equal(ui.navigations[0][0], 'Feed');
  assert.equal(ui.x(), 176);
  ui.advancePickup(1);
  assert.equal(ui.x(), 176, 'An old pickup cannot overwrite the release spring');
  assert.equal(ui.events.length, 1);
});

test('edge resistance deforms the capsule and releases to a valid end tab', () => {
  const ui = mount();
  ui.pan().onBegin(); ui.pan().onStart({ x: 44, translationX: -5 });
  ui.pan().onUpdate({ translationX: -1000 });
  assert.ok(ui.transform()[1].scaleX < 1);
  assert.ok(ui.transform()[2].scaleY > 1.04);
  ui.pan().onEnd({}, true); ui.pan().onFinalize();
  ui.edgeResponse.value = 0;
  assert.equal(ui.x(), 0);
  assert.equal(ui.events.length, 1);
  ui.pan().onStart({ x: 44, translationX: 5 }); ui.pan().onUpdate({ translationX: 1000 });
  ui.pan().onEnd({}, true); ui.pan().onFinalize();
  ui.edgeResponse.value = 0;
  assert.equal(ui.x(), 264);
  assert.equal(ui.navigations[0][0], 'Profile');
});

test('a held pickup reaches the end without an impact and pressure stays continuous', () => {
  const ui = mount({ deferPickup: true });
  ui.pan().onBegin(); ui.pan().onStart({ x: 314, translationX: 10 });
  assert.equal(ui.impacts.length, 0);
  assert.equal(ui.glassWidth(), 360);
  for (const progress of [0.005, 0.01, 0.02, 0.5]) {
    ui.advancePickup(progress);
    assert.equal(ui.impacts.length, 0, 'Departure and transit do not trigger contact');
  }
  ui.advancePickup(1);
  assert.equal(ui.impacts.length, 0, 'A held pickup is not a free-flight collision');
  assert.ok(ui.glassWidth() > 360 && ui.glassWidth() <= 363);
  assert.equal(ui.barTransform()[2].scaleY, 1);
  ui.pan().onUpdate({ translationX: 30 }); ui.pan().onUpdate({ translationX: 40 });
  assert.equal(ui.impacts.length, 0, 'Holding against the end never launches a bounce');
  ui.pan().onEnd({}, true); ui.pan().onFinalize();
  assert.equal(ui.impacts.length, 0, 'Releasing at the contacted end does not add a delayed impact');
  ui.edgeResponse.value = 0;
  assert.equal(ui.glassWidth(), 360);
  assert.equal(ui.barTransform()[2].scaleY, 1);
});

test('a distant tap has more impact than a nearby tap at the same edge', () => {
  const far = mount({ activeIndex: 3 });
  far.pan().onBegin(); far.pan().onFinalize(); far.tap().onEnd({ x: 44 }, true);
  const near = mount({ activeIndex: 1 });
  near.pan().onBegin(); near.pan().onFinalize(); near.tap().onEnd({ x: 44 }, true);
  assert.ok(far.glassWidth() > near.glassWidth());
  assert.ok(far.impacts[0]! > near.impacts[0]!);
});

test('impact stretches toward the contacted end while the opposite edge and icons stay fixed', () => {
  for (const direction of [-1, 1]) {
    const ui = mount({ activeIndex: 1 });
    ui.pan().onBegin(); ui.pan().onFinalize();
    ui.tap(direction < 0 ? 0 : 3).onEnd({ x: direction < 0 ? 44 : 314 }, true);
    const outer = ui.barTransform(), inner = ui.trackTransform();
    const shift = outer[0].translateX;
    const width = 360;
    const extension = ui.glassWidth() - width;
    const fixedEdgeMovement = direction < 0 ? shift + extension / 2 : shift - extension / 2;
    assert.ok(Math.abs(fixedEdgeMovement) < 1e-9, 'The far end stays anchored');
    assert.equal(ui.trackWidth(), 352, 'The controls retain their measured width');
    assert.ok(Math.abs(shift + outer[1].scaleX * inner[0].translateX) < 1e-9, 'Controls retain their position');
    assert.ok(Math.abs(outer[1].scaleX * inner[1].scaleX - 1) < 1e-9, 'Controls retain their scale');
    assert.equal(ui.find('tab-bar-motion').props.style[0].width, width, 'No per-frame layout width update');
    assert.ok(direction < 0 ? shift < 0 : ui.glassWidth() > width);
  }
});

test('holding and reversing between both edges never launches a collision', () => {
  const ui = mount({ activeIndex: 1 });
  ui.pan().onBegin(); ui.pan().onStart({ x: 132, translationX: 5 });
  for (const translationX of [-1000, -1100, 0, 1000, 1100, 0, -1000, 1000]) {
    ui.pan().onUpdate({ translationX });
    assert.equal(ui.impacts.length, 0);
    assert.equal(ui.edgeResponse.value, 0);
    assert.ok(ui.glassWidth() >= 360 && ui.glassWidth() <= 363);
    const left = ui.barTransform()[0].translateX - (ui.glassWidth() - 360) / 2;
    assert.ok(translationX < 0 ? left < 0 : Math.abs(left) < 1e-9, 'Held pressure follows the contacted side');
    assert.equal(ui.events.length, 0, 'Holding does not navigate');
  }
  ui.pan().onEnd({}, true); ui.pan().onFinalize();
  assert.equal(ui.impacts.length, 0);
  assert.equal(ui.navigations[0][0], 'Profile');
  assert.equal(ui.glassWidth(), 360);
});

test('grabbing an active edge recoil cancels it before following the finger', () => {
  const ui = mount({ activeIndex: 3 });
  ui.pan().onBegin(); ui.pan().onFinalize(); ui.tap().onEnd({ x: 44 }, true);
  assert.equal(ui.impacts.length, 1);
  assert.ok(ui.edgeResponse.value > 0);
  ui.pan().onBegin(); ui.pan().onStart({ x: 44, translationX: 5 });
  assert.equal(ui.edgeResponse.value, 0);
  ui.pan().onUpdate({ translationX: 1000 });
  assert.equal(ui.impacts.length, 1, 'The new held arrival adds no collision');
});

test('releasing before an edge preserves the free arrival impact in both directions', () => {
  for (const [translationX, target] of [[-60, 'Home'], [150, 'Profile']] as const) {
    const ui = mount({ activeIndex: 1 });
    ui.pan().onBegin(); ui.pan().onStart({ x: 132, translationX: 5 });
    ui.pan().onUpdate({ translationX });
    assert.equal(ui.impacts.length, 0);
    assert.ok(ui.position.value > 9 && ui.position.value < 255);
    ui.pan().onEnd({}, true); ui.pan().onFinalize();
    assert.equal(ui.impacts.length, 1, 'Only the released capsule can impact the edge');
    assert.ok(ui.glassWidth() > 360);
    assert.equal(ui.events[0].target, target + '-key');
  }
});

test('a tap that reaches an end without overshooting still pushes the glass on both sides', () => {
  for (const [start, x, target, direction] of [[3, 44, 0, -1], [0, 314, 264, 1]] as const) {
    const ui = mount({ activeIndex: start! });
    assert.equal(ui.impacts.length, 0, 'Initial layout is not an impact');
    ui.pan().onBegin(); ui.pan().onFinalize(); ui.tap(target / 88).onEnd({ x }, true);
    assert.equal(ui.position.value, target, 'The mocked spring arrives exactly at the slot');
    assert.equal(ui.impacts.length, 1);
    assert.ok(ui.glassWidth() >= 367.5, 'A full-width approach visibly extends the material');
    assert.ok(direction! < 0 ? ui.x() < 0 : ui.x() > 264, 'The capsule presses into the extended end');
    ui.edgeResponse.value = 0;
    assert.equal(ui.glassWidth(), 360);
    assert.equal(ui.x(), target);
  }
});

test('the expanding glass cannot feed a larger width back into tab and gesture measurements', () => {
  const ui = mount({ activeIndex: 3 });
  ui.pan().onBegin(); ui.pan().onFinalize(); ui.tap().onEnd({ x: 44 }, true);
  assert.ok(ui.glassWidth() > 360);
  assert.equal(ui.find('tab-track').props.onLayout, undefined, 'The deforming glass does not measure the track');
  ui.find('tab-hit-area').props.onLayout({ nativeEvent: { layout: { width: 360 } } }); ui.render();
  assert.equal(ui.trackWidth(), 352);
  assert.equal(ui.find('tab-indicator').props.style[1].width, 88);
  assert.equal(ui.impacts.length, 1);
});

test('a hidden profile reporting zero width cannot remove the shared indicator or cancel its animation', () => {
  const widths: number[] = [];
  const motion: Motion = { position: { value: 123 }, interaction: { value: 0 }, itemWidth: 88, measure: width => widths.push(width), timeline: { current: null } };
  const ui = mount({ indicatorMotion: motion });
  const before = widths.length;
  ui.find('tab-hit-area').props.onLayout({ nativeEvent: { layout: { width: 0 } } }); ui.render();
  assert.equal(widths.length, before, 'A hidden layout never resets shared width');
  assert.equal(ui.find('tab-indicator').props.style[1].width, 88);
  assert.equal(ui.position.value, 123);
  assert.equal(ui.springs.length, 0, 'The in-flight animation was not replaced');
});

test('cancelled and prevented drags restore the controlled route', () => {
  const cancelled = mount({ activeIndex: 1 });
  cancelled.pan().onStart({ x: 140, translationX: 8 }); cancelled.pan().onUpdate({ translationX: 90 }); cancelled.pan().onFinalize();
  assert.equal(cancelled.x(), 88); assert.equal(cancelled.events.length, 0);
  const prevented = mount({ prevented: true });
  prevented.pan().onStart({ x: 54, translationX: 10 }); prevented.pan().onUpdate({ translationX: 180 }); prevented.pan().onEnd({}, true);
  prevented.edgeResponse.value = 0;
  assert.equal(prevented.x(), 0); assert.equal(prevented.navigations.length, 0);
  const rolePrevented = mount({ roleRouting: true, prevented: true });
  rolePrevented.tap(2).onEnd({ x: 220 }, true);
  assert.equal(rolePrevented.x(), 0); assert.deepEqual(rolePrevented.selections, ['Feed']);
});

test('external navigation cancels a drag without a late selection overriding it', () => {
  const ui = mount();
  ui.pan().onStart({ x: 54, translationX: 10 }); ui.pan().onUpdate({ translationX: 160 });
  const running = ui.pan(); ui.render({ activeIndex: 1 });
  running.onUpdate({ translationX: 264 }); running.onEnd({}, true);
  assert.equal(ui.x(), 88); assert.equal(ui.events.length, 0);
});

test('external navigation also cancels an unfinished pickup', () => {
  const ui = mount({ deferPickup: true });
  ui.pan().onStart({ x: 230, translationX: 10 });
  ui.advancePickup(0.3);
  const running = ui.pan(); ui.render({ activeIndex: 1 });
  ui.advancePickup(1); running.onUpdate({ translationX: 100 }); running.onEnd({}, true);
  assert.equal(ui.x(), 88); assert.equal(ui.events.length, 0);
});

test('a new navbar joins the shared animation without resetting position or its press response', () => {
  const motion: Motion = { position: { value: 123 }, interaction: { value: 0.7 }, edgeResponse: { value: 0.6 }, itemWidth: 88, measure() {}, timeline: { current: null } };
  const first = mount({ activeIndex: 2, indicatorMotion: motion });
  assert.equal(first.x(), 123); assert.equal(first.interaction.value, 0.7);
  const second = mount({ activeIndex: 2, indicatorMotion: motion });
  assert.equal(second.x(), 123); assert.equal(second.interaction.value, 0.7);
  assert.equal(second.transform()[1].scaleX, first.transform()[1].scaleX, 'Edge deformation is shared across scenes');
  assert.equal(second.springs.length, 0, 'The provider owns the running animation');
  motion.position.value = 266;
  const atEdge = mount({ activeIndex: 3, indicatorMotion: motion });
  assert.equal(atEdge.impacts.length, 0, 'Mounting during contact does not restart the impact');
  assert.equal(atEdge.edgeResponse.value, 0.6);
});

test('press briefly expands the capsule and releases through the bounce spring', () => {
  const ui = mount();
  ui.pan().onBegin();
  assert.equal(ui.transform()[1].scaleX, 1.08); assert.equal(ui.transform()[2].scaleY, 1.04);
  assert.ok(ui.springs.some(spring => spring.target === 1 && spring.config.kind === 'press'));
  ui.pan().onFinalize();
  assert.equal(ui.transform()[1].scaleX, 1); assert.equal(ui.interaction.value, 0);
  assert.ok(ui.springs.some(spring => spring.target === 0 && spring.config.kind === 'release'));
  assert.equal(ui.events.length, 0);
});

test('accessible activation preserves role routing and the selected tab state', () => {
  const ui = mount({ roleRouting: true });
  assert.equal(ui.find('tab-Home').props.accessibilityState.selected, true);
  assert.equal(ui.find('tab-Profile').props.accessibilityRole, 'tab');
  ui.find('tab-Profile').props.onAccessibilityTap();
  assert.deepEqual(ui.selections, ['Profile']);
  assert.equal(ui.events.length, 0); assert.equal(ui.navigations.length, 0);
});

test('touch expands a compact navbar without changing which displayed tab was tapped', () => {
  const ui = mount({ scrollCompact: 1 });
  assert.equal(ui.compactTransform()[0].scale, 0.83);
  ui.pan().onBegin(); ui.pan().onFinalize();
  assert.equal(ui.scrollController.compact.value, 0);
  assert.equal(ui.scrollController.touches, 1);
  assert.equal(ui.events.length, 0, 'Touching alone does not switch screens');
  // At compact scale x=100 is still Home; after expansion it would be Map.
  ui.tap().onEnd({ x: 100 }, true);
  assert.equal(ui.events[0].target, 'Home-key');
  assert.equal(ui.navigations.length, 0);
});

test('a distant drag from a compact navbar keeps pickup smooth while expanding', () => {
  const ui = mount({ scrollCompact: 1, deferPickup: true });
  ui.pan().onBegin(); ui.pan().onStart({ x: 300, translationX: 10 });
  assert.equal(ui.scrollController.compact.value, 0);
  assert.equal(ui.x(), 0, 'Expansion does not teleport the capsule under the finger');
  ui.pan().onUpdate({ translationX: 20 }); ui.pan().onEnd({}, true); ui.pan().onFinalize();
  assert.equal(ui.navigations[0][0], 'Profile');
  assert.equal(ui.events.length, 1);
  ui.advancePickup(1);
  assert.equal(ui.position.value, 264, 'An old pickup cannot overwrite the committed tab');
  ui.edgeResponse.value = 0;
  assert.equal(ui.x(), 264);
});

test('accessible activation also expands a compact navbar and cancels old scroll intent', () => {
  const ui = mount({ scrollCompact: 1, roleRouting: true });
  ui.find('tab-Profile').props.onAccessibilityTap();
  assert.equal(ui.scrollController.compact.value, 0);
  assert.equal(ui.scrollController.touches, 1);
  assert.deepEqual(ui.selections, ['Profile']);
});
