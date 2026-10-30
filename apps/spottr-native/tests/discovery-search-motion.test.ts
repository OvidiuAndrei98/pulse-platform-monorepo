import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { initialSearchBounds, keyboardMorphProgress, searchDismissSpring, searchMorphGeometry, searchMorphSpring } from '../src/screens/searchMorph';
const { hooks, modules } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function fixture(reduced = false, platform = 'ios') {
  const h = hooks(), react = { ...h.react, useLayoutEffect: h.react.useEffect };
  let handlers: any, visibility: any, onUI = false, motion: any, listener: any, reacting = false;
  const springs: any[] = [], queued: (() => void)[] = [], values: any[] = [], reactions: any[] = [], notifications: boolean[] = [];
  let completed = 0;
  const origins: string[] = [], animations = new Map<any, any>();
  const ui = (fn: any, ...args: any[]) => {
    const previous = onUI; onUI = true;
    try {
      const value = fn(...args);
      if (!reacting) {
        reacting = true;
        for (const r of reactions) { const next = r.prepare(); if (next !== r.previous) { const old = r.previous; r.previous = next; r.effect(next, old); } }
        reacting = false;
      }
      return value;
    } finally { onUI = previous; }
  };
  const shared = (initial: any) => {
    let value = initial;
    const box = {
      get value() { assert.ok(onUI, 'No shared-value reads on JS'); return value; },
      set value(next: any) {
        if (next?.spring) { const spring = { ...next, box }; springs.push(spring); animations.set(box, spring); }
        else { animations.delete(box); value = next; }
      },
    };
    values.push(box); return box;
  };
  const { useDiscoverySearchMotion } = modules({
    react,
    'react-native': { Platform: { OS: platform }, AccessibilityInfo: { addEventListener: (_: string, fn: any) => { listener = fn; return { remove: () => {} }; } } },
    'react-native-reanimated': {
      useReducedMotion: () => reduced,
      useSharedValue: (initial: any) => react.useRef(shared(initial)).current,
      useAnimatedReaction: (prepare: any, effect: any) => {
        const r = react.useRef({ prepare, effect, previous: null, registered: false }).current;
        r.prepare = prepare; r.effect = effect;
        if (!r.registered) { r.registered = true; reactions.push(r); }
      },
      withSpring: (target: number, config: any, callback: any) => ({ spring: true, target, config, callback }),
      cancelAnimation: (box: any) => animations.delete(box), ReduceMotion: { Always: 'always', Never: 'never', System: 'system' },
      runOnUI: (fn: any) => (...args: any[]) => ui(fn, ...args),
      runOnJS: (fn: any) => (...args: any[]) => { queued.push(() => fn(...args)); },
    },
    './useSearchKeyboardEvents': { useSearchKeyboardEvents: (value: any, native: any) => { handlers = value; visibility = native; } },
  }).load(path.resolve(__dirname, '../src/screens/useDiscoverySearchMotion.ts'));
  const render = () => { motion = h.render(() => useDiscoverySearchMotion(false, () => completed++, (next: boolean, origin: string) => { notifications.push(next); origins.push(origin); })); };
  render();
  return {
    open: () => motion.setOpen(true), close: () => motion.setOpen(false), detach: () => motion.detach(),
    set: (value: number) => ui(() => { motion.progress.value = value; }),
    advance: (value: number) => ui(() => {
      const animation = animations.get(motion.progress);
      motion.progress.value = value;
      if (animation) animations.set(motion.progress, animation);
    }),
    progress: () => ui(() => motion.progress.value),
    event: (name: string, progress: number) => ui(handlers[name], { progress, height: 300 * progress, duration: 250, target: 7 }),
    native: (name: string) => visibility[name](),
    flush: () => { while (queued.length) queued.shift()!(); render(); },
    finishSpring: (index = springs.length - 1) => { const spring = springs[index]; ui(() => {
      const active = animations.get(spring.box) === spring;
      if (active) spring.box.value = spring.target;
      spring.callback?.(active);
    }); },
    reduce: (value: boolean) => { listener(value); render(); },
    dispose: () => h.unmount(), springs, notifications, origins, controlsReady: () => motion.controlsReady,
    phase: () => motion.phase, isOpen: () => motion.isOpen(), completed: () => completed,
  };
}

test('search geometry stays rounded and bounded throughout its shared path', () => {
  for (const width of [240, 280, 350, 728]) {
    const bounds = initialSearchBounds(width);
    const start = searchMorphGeometry(bounds, 0), end = searchMorphGeometry(bounds, 1);
    assert.equal(start.searchWidth, 44); assert.equal(start.radius, 22);
    assert.equal(end.searchX, 52); assert.equal(end.searchWidth + end.searchX, width);
    assert.equal(end.radius, 22); assert.equal(end.back, 1); assert.equal(end.controls, 0);
    for (let step = 0; step <= 120; step++) {
      const frame = searchMorphGeometry(bounds, step / 120);
      assert.ok(frame.searchX + frame.searchWidth <= width + .001);
      assert.ok(frame.searchX >= 52 - .001, 'Search never intersects the fixed Back circle');
      assert.equal(frame.radius * 2, frame.searchHeight, 'Search stays fully rounded');
      if (frame.controls > 0) {
        assert.equal(frame.back, 0, 'Back and the switch materials cannot stack');
      }
    }
    assert.equal(searchMorphGeometry(bounds, .2).text, 0, 'Text waits for space');
  }
});

test('controls crossfade across multiple morph positions and text disappears before its viewport clips', () => {
  for (const width of [240, 280, 350, 728]) for (const textWidth of [24, 144, 240, 900]) {
    const bounds = initialSearchBounds(width);
    for (let i = 0; i <= 120; i++) {
      const frame = searchMorphGeometry(bounds, i / 120, textWidth);
      if (frame.text > 0) assert.ok(frame.searchWidth > Math.min(textWidth, bounds.destination.width - 76) + 44);
    }
    const early = searchMorphGeometry(bounds, .15), later = searchMorphGeometry(bounds, .3);
    assert.ok(early.controls < 1 && early.controls > later.controls && later.controls > 0, 'No endpoint-only visibility swap');
    assert.equal(early.back, 0); assert.equal(later.back, 0);
  }
});

test('morph uses measured endpoints, including non-default positions and sizes', () => {
  const bounds = { source: { x: 201.5, y: 1.25, width: 44, height: 44 }, destination: { x: 54.5, y: 2.5, width: 301.25, height: 44 } };
  const start = searchMorphGeometry(bounds, 0), end = searchMorphGeometry(bounds, 1);
  assert.equal(start.searchX, bounds.source.x); assert.equal(start.searchY, bounds.source.y);
  assert.equal(end.searchX, bounds.destination.x); assert.equal(end.searchY, bounds.destination.y);
  assert.equal(end.searchWidth, bounds.destination.width);
  for (let i = 0; i <= 120; i++) {
    const frame = searchMorphGeometry(bounds, i / 120);
    assert.equal(frame.contentWidth, bounds.destination.width, 'Input has fixed destination bounds');
    if (i) assert.ok(Math.abs(frame.searchX - searchMorphGeometry(bounds, (i - 1) / 120).searchX) < 2, 'No geometry discontinuity');
  }
});

test('terminal elasticity stays inside screen insets and Back never bounces on exit', () => {
  assert.ok(searchMorphSpring.stiffness / searchMorphSpring.mass < searchDismissSpring.stiffness / searchDismissSpring.mass);
  for (const width of [240, 280, 362, 728]) {
    const bounds = initialSearchBounds(width);
    for (const p of [-.05, -.015, -.005, 0, .45, .65, .8, .98, 1, 1.005, 1.02, 1.1]) {
      const opening = searchMorphGeometry(bounds, p);
      assert.ok(opening.fieldScaleX >= 1 && opening.fieldScaleX <= 1.015);
      assert.ok(bounds.destination.width * (opening.fieldScaleX - 1) <= 6 + 1e-8);
      assert.ok(opening.backScale >= .93 && opening.backScale <= 1.035);
      if (opening.fieldScaleX > 1) assert.equal(opening.backScale, 1, 'Back finishes before the capsule overshoots');
      const closing = searchMorphGeometry(bounds, p, 144, { opening: false, interactive: false, reduced: false });
      assert.ok(closing.backScale <= 1); assert.equal(closing.fieldScaleX, 1);
      assert.ok(closing.sourceScale >= 1 && closing.sourceScale <= 1.01);
      const drag = searchMorphGeometry(bounds, p, 144, { opening: true, interactive: true, reduced: false });
      assert.equal(drag.fieldScaleX, 1); assert.equal(drag.sourceScale, 1);
      const reduced = searchMorphGeometry(bounds, p, 144, { opening: true, interactive: false, reduced: true });
      assert.equal(reduced.fieldScaleX, 1); assert.equal(reduced.sourceScale, 1);
      assert.equal(reduced.backScale, 1); assert.equal(reduced.controlsScale, 1);
    }
  }
});

test('opening spends time on visible travel instead of a fast jump followed by a long tail', () => {
  const { stiffness, damping, mass } = searchMorphSpring;
  const alpha = damping / (2 * mass), frequency = Math.sqrt(stiffness / mass - alpha * alpha);
  const bounds = initialSearchBounds(362);
  const fraction = (ms: number) => {
    const t = ms / 1000;
    const progress = 1 - Math.exp(-alpha * t) * (Math.cos(frequency * t) + alpha / frequency * Math.sin(frequency * t));
    return (searchMorphGeometry(bounds, progress).searchWidth - 44) / (bounds.destination.width - 44);
  };
  assert.ok(fraction(100) < .25, 'The capsule cannot consume most of its travel in the first 100ms');
  const times = Array.from({ length: 701 }, (_, ms) => ms);
  const first = times.find(ms => fraction(ms) >= .1)!;
  const last = times.find(ms => fraction(ms) >= .9)!;
  assert.ok(last - first >= 190 && last - first <= 430, 'Most of the visible morph has a relaxed, bounded duration');
  assert.ok(fraction(450) >= .99, 'The field reaches its destination without a prolonged half-open state');
});

test('focus waits for UI intent and invisible controls cannot activate during a reversal', () => {
  const f = fixture(); f.open(); assert.deepEqual(f.notifications, []);
  f.flush(); assert.deepEqual(f.notifications, [true]); assert.equal(f.controlsReady(), false);
  f.set(1); f.event('onStart', 1); f.event('onEnd', 1); f.close(); f.flush();
  assert.equal(f.controlsReady(), false, 'A repeated Back cannot activate the invisible map/list switch');
  f.event('onStart', 0); f.event('onMove', .15); f.flush(); assert.equal(f.controlsReady(), false);
  f.advance(.01); f.flush(); assert.equal(f.controlsReady(), true);
  f.open(); f.close(); f.flush(); assert.equal(f.notifications.at(-1), false, 'An obsolete focus request is ignored');
});

test('keyboard presentation leaves the opening spring in charge; dismissal uses a bounded finish', () => {
  const f = fixture(); f.open(); f.advance(.15);
  f.event('onStart', 1); f.event('onMove', .4);
  assert.equal(f.progress(), .15, 'Automatic keyboard frames cannot consume the opening travel');
  f.event('onEnd', 1); assert.equal(f.progress(), .15, 'Keyboard completion cannot snap the unfinished morph');
  f.finishSpring(); assert.equal(f.progress(), 1);
  const springsBeforeClose = f.springs.length;
  f.close(); assert.equal(f.progress(), 1); assert.equal(f.springs.length, springsBeforeClose, 'Wait for actual keyboard dismissal');
  f.event('onStart', 0); f.advance(.7); f.event('onMove', .55); assert.equal(f.progress(), .7, 'Native tail cannot overwrite the finish');
  assert.equal(f.springs.at(-1).config.stiffness, searchDismissSpring.stiffness);
  f.event('onEnd', 0); f.finishSpring(); f.flush(); assert.equal(f.progress(), 0); assert.equal(f.completed(), 1);
});

test('willShow cannot park the morph while iOS prepares its first keyboard frame', () => {
  const f = fixture(); f.open(); f.flush(); f.event('onStart', 1); f.event('onMove', 0);
  f.finishSpring(); assert.equal(f.progress(), 1, 'Opening spring survives the non-moving presentation interval');
  f.event('onMove', .05); assert.equal(f.progress(), 1, 'Native handover cannot rewind the displayed shape');
  f.event('onEnd', 1); f.close(); f.event('onStart', 0); f.event('onMove', .5);
  assert.equal(f.springs.at(-1).target, 0, 'Native dismissal starts the short finish');
});

test('late or repeated keyboard-show events cannot rewind or restart the opening spring', () => {
  const f = fixture(); f.open(); f.advance(.15); f.event('onStart', 1);
  const count = f.springs.length;
  f.advance(.4); f.event('onMove', 0); assert.equal(f.progress(), .4);
  f.event('onMove', .1); f.event('onStart', 1); f.event('onMove', .9);
  assert.equal(f.progress(), .4); assert.equal(f.springs.length, count);
  f.finishSpring(); assert.equal(f.progress(), 1);
});

function shown() {
  const f = fixture(); f.open(); f.flush();
  f.event('onStart', 1); f.event('onMove', 1); f.event('onEnd', 1); f.flush();
  f.finishSpring();
  return f;
}

test('manual native dismissal automatically reverses Search and completes exactly once', () => {
  const f = shown();
  f.event('onStart', 0); f.flush();
  assert.equal(f.phase(), 'closing'); assert.equal(f.isOpen(), false);
  assert.deepEqual(f.origins, ['command', 'keyboard'], 'No second native dismiss/focus command');
  f.advance(.55); f.event('onMove', .8); assert.equal(f.progress(), .55);
  const count = f.springs.length;
  f.event('onEnd', 0); f.native('onDidHide'); f.event('onEnd', 0); f.finishSpring(); f.flush();
  assert.equal(f.springs.length, count, 'Duplicate native notifications do not restart the finish');
  assert.equal(f.phase(), 'closed'); assert.equal(f.progress(), 0); assert.equal(f.completed(), 1);
  assert.deepEqual(f.notifications, [true, false]); assert.equal(f.controlsReady(), true);
});

test('iOS interactive drag follows every frame, including an upward cancellation', () => {
  const f = shown();
  for (const p of [.9, .65, .4, .55]) { f.event('onInteractive', p); assert.ok(Math.abs(f.progress() - p) < 1e-8); }
  f.flush(); assert.equal(f.phase(), 'open'); assert.equal(f.isOpen(), true);
  assert.deepEqual(f.notifications, [true], 'A provisional swipe must not resign input focus');
  const before = f.progress(); f.event('onStart', 1);
  assert.equal(f.progress(), before, 'Cancellation retains current geometry');
  f.event('onMove', .8); assert.equal(f.progress(), before, 'A released, cancelled gesture finishes with its spring');
  f.advance(.8); f.event('onEnd', 1); assert.equal(f.progress(), .8, 'No end-event snap');
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'open'); assert.equal(f.progress(), 1); assert.equal(f.completed(), 0);
});

test('committing a partial interactive drag closes Search from its displayed bounds', () => {
  const f = shown(); f.event('onInteractive', .6); const before = f.progress();
  f.event('onStart', 0); f.flush(); assert.equal(f.phase(), 'closing'); assert.equal(f.progress(), before);
  f.advance(.3); f.event('onMove', .5); assert.ok(Math.abs(f.progress() - .3) < 1e-8);
  f.event('onEnd', 0); f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
});

test('an iOS willHide notification does not prevent cancelling the native gesture', () => {
  const f = shown(); f.event('onInteractive', .7); f.native('onWillHide'); f.flush();
  assert.equal(f.phase(), 'open', 'willHide alone cannot commit a finger-down gesture');
  f.event('onInteractive', .5); f.event('onStart', 1); f.event('onMove', .8); f.event('onEnd', 1); f.flush();
  assert.equal(f.phase(), 'open'); assert.equal(f.isOpen(), true); assert.equal(f.completed(), 0);
  assert.deepEqual(f.origins, ['command']);
});

test('UIKit can cancel an automatic close even after the short visual finish', () => {
  const f = shown(); f.event('onInteractive', .65); f.event('onStart', 0); f.flush();
  f.finishSpring(); assert.equal(f.progress(), 0); assert.equal(f.completed(), 0);
  f.event('onStart', 1); f.event('onMove', .8); f.event('onEnd', 1); f.finishSpring(); f.flush();
  assert.equal(f.phase(), 'open'); assert.equal(f.progress(), 1); assert.equal(f.completed(), 0);
});

test('a native hide completion releases an already settled morph without another animation', () => {
  const f = shown(); f.event('onInteractive', .5); f.event('onStart', 0); f.flush();
  f.finishSpring(); assert.equal(f.progress(), 0); const count = f.springs.length;
  f.event('onEnd', 0); f.native('onDidHide'); f.flush();
  assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1); assert.equal(f.springs.length, count);
});

test('iOS willHide fallback starts the reverse morph and duplicate notifications finish only once', () => {
  const f = shown(), count = f.springs.length;
  f.native('onWillHide'); f.flush(); assert.equal(f.phase(), 'closing');
  assert.equal(f.progress(), 1); assert.equal(f.springs.length, count + 1); assert.equal(f.springs.at(-1).target, 0);
  f.advance(.3); f.native('onDidHide'); f.native('onDidHide'); f.finishSpring(); f.flush();
  assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1); assert.deepEqual(f.notifications, [true, false]);
});

test('Android didHide-only dismissal cannot leave the field expanded', () => {
  const f = fixture(false, 'android'); f.open(); f.flush(); f.finishSpring(); f.native('onDidShow');
  f.native('onDidHide'); f.flush();
  assert.equal(f.phase(), 'closing'); assert.equal(f.progress(), 1, 'Fallback springs from actual bounds');
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
});

test('Back, Done and a hardware keyboard close through the same idempotent command', () => {
  const f = fixture(); assert.equal(f.open(), true); assert.equal(f.open(), false); f.flush(); f.finishSpring();
  assert.equal(f.close(), true); assert.equal(f.close(), false); f.flush();
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
  assert.deepEqual(f.origins, ['command', 'command']);
});

test('rapid reopen rejects old hide events, focus requests and spring completions', () => {
  const f = shown(); f.close(); f.flush(); f.native('onWillHide'); const old = f.springs.length - 1;
  f.set(.6); f.open(); f.event('onEnd', 0); f.native('onDidHide'); f.finishSpring(old); f.flush();
  assert.equal(f.progress(), .6); assert.equal(f.phase(), 'open'); assert.equal(f.completed(), 0);
  f.event('onStart', 1); f.event('onMove', .8); f.event('onEnd', 0); f.native('onDidHide'); f.flush();
  assert.ok(f.progress() >= .6); assert.equal(f.isOpen(), true);
  f.event('onEnd', 1); f.close(); f.flush(); f.event('onStart', 1);
  assert.equal(f.isOpen(), false, 'An obsolete show cannot reverse an explicit Back');
  f.event('onStart', 0); f.event('onMove', 0); f.event('onEnd', 0); f.finishSpring(); f.flush(); assert.equal(f.completed(), 1);
  assert.equal(keyboardMorphProgress(.7, .7, 1, .6), .6);
});

test('reduced motion, screen blur and unmount preserve completion ownership', () => {
  const f = fixture(); f.open(); f.set(.4); f.reduce(true); assert.equal(f.progress(), 1);
  f.close(); f.finishSpring(); f.flush(); assert.equal(f.progress(), 0); assert.equal(f.completed(), 1);
  f.reduce(false); f.open(); f.close(); f.detach(); f.finishSpring(); f.dispose(); f.flush();
  assert.equal(f.completed(), 1, 'No late focus or query updates after unmount');
});

test('manual dismissal during presentation also collapses a partially expanded field', () => {
  for (const interactive of [false, true]) {
    const f = fixture(); f.open(); f.set(.2); f.event('onStart', 1); f.event('onMove', .5);
    const before = f.progress();
    if (interactive) f.event('onInteractive', .3);
    else { f.event('onStart', 0); f.event('onMove', .3); }
    assert.ok(f.progress() <= before && f.progress() > 0, 'Continue from the displayed partial geometry');
    f.event('onEnd', 0); f.finishSpring(); f.flush(); assert.equal(f.progress(), 0);
    assert.equal(f.completed(), 1); assert.equal(f.phase(), 'closed');
  }
});

test('reduced motion does not create a phantom close at startup', () => {
  const f = fixture(true); f.flush(); assert.equal(f.completed(), 0);
  f.open(); f.flush(); f.finishSpring(); f.close(); f.flush(); f.finishSpring(); f.flush();
  assert.equal(f.completed(), 1); assert.equal(f.phase(), 'closed');
});

test('a detached screen ignores subsequent keyboard gestures', () => {
  const f = shown(); f.detach(); f.flush(); f.event('onInteractive', .4); f.event('onStart', 1);
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.isOpen(), false);
});

test('Back before the first keyboard frame cannot snap partially expanded geometry', () => {
  const f = fixture(); f.open(); f.flush(); f.set(.35); f.event('onStart', 1);
  f.close(); f.flush(); f.event('onStart', 0); f.event('onEnd', 0);
  assert.equal(f.progress(), .35, 'No keyboard movement must not snap the search surface');
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
});

test('reopen then immediate Back does not wait forever for the previous keyboard generation', () => {
  const f = shown(); f.close(); f.flush(); f.event('onStart', 0); f.event('onMove', .5);
  f.open(); f.close(); f.flush(); f.event('onEnd', 0); f.native('onDidHide');
  f.finishSpring(); f.flush(); assert.equal(f.phase(), 'closed'); assert.equal(f.completed(), 1);
  assert.equal(f.progress(), 0); assert.equal(f.isOpen(), false);
});
