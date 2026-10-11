import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const C = {
  SCROLLABLE_STATUS: { LOCKED: 0, UNLOCKED: 1 }, SHEET_STATE: { OPENED: 0, EXTENDED: 1, FILL_PARENT: 2 },
  ANIMATION_STATUS: { RUNNING: 1, STOPPED: 0 }, ANIMATION_SOURCE: { GESTURE: 2 },
  KEYBOARD_STATUS: { HIDDEN: 2, SHOWN: 1 }, SCROLLABLE_TYPE: { VIEW: 1, SCROLLVIEW: 3 },
  GESTURE_SOURCE: { HANDLE: 2, CONTENT: 3 },
};
const shared = <T>(value: T) => ({ value, get() { return this.value; }, set(next: T | ((previous: T) => T)) { this.value = typeof next === 'function' ? (next as (v: T) => T)(this.value) : next; } });
function fixture(reentrant = true) {
  const offset = shared(0), commands: number[] = [], destinations: number[] = [];
  const internal = {
    animatedScrollableStatus: shared(C.SCROLLABLE_STATUS.LOCKED), animatedSheetState: shared(C.SHEET_STATE.OPENED),
    animatedHandleGestureState: shared(0), animatedScrollableState: shared({ contentOffsetY: 0, type: C.SCROLLABLE_TYPE.SCROLLVIEW, refreshable: false }),
    animatedAnimationState: shared({ status: C.ANIMATION_STATUS.STOPPED }),
    animatedPosition: shared(250), animatedDetentsState: shared({ highestDetentPosition: 84.4, detents: [84.4], closedDetentPosition: 844 }),
    animatedLayoutState: shared({ containerHeight: 844, window: { height: 844 } }),
    animatedKeyboardState: shared({ status: C.KEYBOARD_STATUS.HIDDEN }), isInTemporaryPosition: shared(false),
    enableOverDrag: true, enablePanDownToClose: true, overDragResistanceFactor: 2.5,
    stopAnimation: () => { internal.animatedAnimationState.value.status = C.ANIMATION_STATUS.STOPPED; },
    animateToPosition: (position: number) => { destinations.push(position); },
  };
  let handlers: any, context: any = {};
  const dependencies: any = {
    react: { useCallback: (f: any) => f },
    'react-native-gesture-handler': { State: { ACTIVE: 4 } },
    'react-native': { Platform: { OS: 'ios' }, Keyboard: { dismiss() {} } },
    'react-native-reanimated': { useSharedValue: shared, runOnJS: (f: any) => f, scrollTo: (_: unknown, _x: number, y: number) => {
      commands.push(y);
      if (commands.length > 12) throw Error('Recursive native scrollTo');
      // Fabric can synchronously send onScroll from dispatchCommand(scrollTo).
      if (reentrant) handlers.handleOnScroll({ contentOffset: { y } }, context);
    } },
    '../constants': C,
    './useBottomSheetInternal': { useBottomSheetInternal: () => internal },
  };
  const load = (file: string) => {
    const exports: any = {};
    const js = ts.transpileModule(readFileSync(resolve(__dirname, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(js, { exports, require: (id: string) => { if (!(id in dependencies)) throw Error(id); return dependencies[id]; } });
    return exports;
  };
  const defaults = load('../node_modules/@gorhom/bottom-sheet/src/hooks/useScrollEventsHandlersDefault.ts');
  dependencies['../utilities/clamp'] = load('../node_modules/@gorhom/bottom-sheet/src/utilities/clamp.ts');
  dependencies['../utilities/snapPoint'] = load('../node_modules/@gorhom/bottom-sheet/src/utilities/snapPoint.ts');
  const pan = load('../node_modules/@gorhom/bottom-sheet/src/hooks/useGestureEventsHandlersDefault.tsx').useGestureEventsHandlersDefault();
  dependencies['@gorhom/bottom-sheet'] = { ...C, ...defaults, useBottomSheetInternal: () => internal };
  const hook = process.env.TEST_NATIVE_SCROLL_BASELINE ? defaults.useScrollEventsHandlersDefault : load('../src/ui/useSheetScrollEvents.ts').useSheetScrollEvents;
  handlers = hook({}, offset);
  return {
    internal, offset, commands, destinations,
    gesture(name: string, translationY: number, velocityY = 0) { pan[name](C.GESTURE_SOURCE.CONTENT, { translationY, velocityY, absoluteY: 400 }); },
    run(name: string, y: number) { handlers[name]({ contentOffset: { y } }, context); },
  };
}
test('native locked scroll cannot recursively dispatch scrollTo on Fabric', () => {
  const f = fixture();
  f.run('handleOnScroll', 42);
  assert.deepEqual(f.commands, [0]);
  assert.equal(f.offset.value, 0);
});
test('locked native momentum keeps the real offset when returning from checkout', () => {
  const f = fixture(false);
  f.run('handleOnBeginDrag', 320);
  f.run('handleOnMomentumEnd', 320);
  assert.equal(f.offset.value, 320);
  assert.deepEqual(f.commands, []);
});
test('native lock corrects movement once and tolerates pixel rounding', () => {
  const f = fixture();
  f.run('handleOnBeginDrag', 220.3333);
  f.run('handleOnEndDrag', 250);
  assert.deepEqual(f.commands, [220.3333]);
  f.run('handleOnScroll', 220.5);
  assert.equal(f.commands.length, 1);
});
test('unlocked native scrolling and momentum preserve ordinary content movement', () => {
  const f = fixture();
  f.internal.animatedScrollableStatus.value = C.SCROLLABLE_STATUS.UNLOCKED;
  f.internal.animatedSheetState.value = C.SHEET_STATE.EXTENDED;
  f.run('handleOnBeginDrag', 0);
  f.run('handleOnScroll', 230);
  f.run('handleOnEndDrag', 400);
  f.run('handleOnMomentumEnd', 700);
  assert.equal(f.offset.value, 700);
  assert.equal(f.internal.animatedScrollableState.value.contentOffsetY, 700);
  assert.deepEqual(f.commands, []);
  f.run('handleOnBeginDrag', 700);
  f.run('handleOnScroll', 80);
  f.run('handleOnEndDrag', 0);
  assert.equal(f.internal.animatedScrollableState.value.contentOffsetY, 0);
});

test('a visually expanded native sheet retains a long scroll after release and momentum', () => {
  const f = fixture();
  // The derived lock can still report OPENED/LOCKED at a fractional snap.
  // Test the complete scroll lifecycle, not just already-unlocked handlers.
  f.internal.animatedPosition.value = 84.400001;
  f.run('handleOnBeginDrag', 0);
  f.run('handleOnScroll', 180);
  f.run('handleOnScroll', 380);
  f.run('handleOnEndDrag', 420);
  f.run('handleOnScroll', 570);
  f.run('handleOnMomentumEnd', 600);
  assert.deepEqual(f.commands, [], 'Releasing the finger must not issue scrollTo(0)');
  assert.equal(f.offset.value, 600);
  assert.equal(f.internal.animatedScrollableState.value.contentOffsetY, 600);
  f.run('handleOnBeginDrag', 600);
  f.run('handleOnScroll', 350);
  f.run('handleOnEndDrag', 350);
  assert.equal(f.offset.value, 350, 'The next drag must start at the retained position');
});

test('native scroll offset is retained during movement before end-drag or refocus', () => {
  const f = fixture();
  f.internal.animatedScrollableStatus.value = C.SCROLLABLE_STATUS.UNLOCKED;
  f.internal.animatedSheetState.value = C.SHEET_STATE.EXTENDED;
  f.internal.animatedPosition.value = 84.4;
  f.run('handleOnBeginDrag', 0);
  f.run('handleOnScroll', 320);
  assert.equal(f.offset.value, 320, 'Focus registration must not restore the initial zero');
  // The pan recognizer uses the starting offset with cumulative translation;
  // replacing it on every scroll frame would break downward drag handoff.
  assert.equal(f.internal.animatedScrollableState.value.contentOffsetY, 0);
});

test('releasing during layout settling saves the native offset even without momentum', () => {
  const f = fixture();
  f.internal.animatedPosition.value = 84.4;
  f.internal.animatedScrollableStatus.value = C.SCROLLABLE_STATUS.UNLOCKED;
  f.internal.animatedSheetState.value = C.SHEET_STATE.EXTENDED;
  f.internal.animatedAnimationState.value.status = C.ANIMATION_STATUS.RUNNING;
  f.run('handleOnBeginDrag', 0);
  f.run('handleOnScroll', 250);
  f.run('handleOnEndDrag', 270);
  assert.equal(f.offset.value, 270);
  assert.equal(f.internal.animatedScrollableState.value.contentOffsetY, 270);
  assert.deepEqual(f.commands, []);
});

test('native drag-to-dismiss still locks at the top once the sheet moves down', () => {
  const f = fixture();
  f.internal.animatedPosition.value = 84.4;
  f.run('handleOnBeginDrag', 0);
  f.internal.animatedPosition.value = 150;
  f.run('handleOnScroll', -30);
  f.run('handleOnEndDrag', 0);
  assert.deepEqual(f.commands, [0]);
  assert.equal(f.offset.value, 0);
});

test('dragging the grabber preserves its locked offset, including above the open snap', () => {
  const f = fixture();
  f.internal.animatedPosition.value = 60;
  f.internal.animatedHandleGestureState.value = 4;
  f.run('handleOnBeginDrag', 300);
  f.run('handleOnScroll', 300);
  f.run('handleOnEndDrag', 340);
  assert.deepEqual(f.commands, [300]);
  assert.equal(f.offset.value, 300);
});

test('real Gorhom pan and native scroll cooperate through release, reverse scroll and dismissal', () => {
  for (const releaseOrder of ['pan-first', 'scroll-first']) {
    const f = fixture();
    f.internal.animatedPosition.value = 84.4;
    f.internal.animatedSheetState.value = C.SHEET_STATE.EXTENDED;
    f.internal.animatedScrollableStatus.value = C.SCROLLABLE_STATUS.UNLOCKED;
    f.run('handleOnBeginDrag', 0);
    f.gesture('handleOnStart', 0);
    f.gesture('handleOnChange', -300);
    f.run('handleOnScroll', 300);
    if (releaseOrder === 'scroll-first') f.run('handleOnEndDrag', 300);
    f.gesture('handleOnEnd', -300, -1000);
    if (releaseOrder === 'pan-first') f.run('handleOnEndDrag', 300);
    f.run('handleOnScroll', 580);
    f.run('handleOnMomentumEnd', 600);
    assert.equal(f.offset.value, 600);
    assert.equal(f.internal.animatedPosition.value, 84.4);
    assert.deepEqual(f.commands, []);
    assert.deepEqual(f.destinations, []);

    f.run('handleOnBeginDrag', 600);
    f.gesture('handleOnStart', 0);
    f.gesture('handleOnChange', 200);
    f.run('handleOnScroll', 400);
    assert.equal(f.internal.animatedPosition.value, 84.4, 'Scrolling back through content must not drag the sheet');
    f.gesture('handleOnEnd', 200);
    f.run('handleOnEndDrag', 400);
    assert.equal(f.offset.value, 400);

    f.run('handleOnBeginDrag', 400);
    f.gesture('handleOnStart', 0);
    f.gesture('handleOnChange', 400);
    f.run('handleOnScroll', 0);
    f.gesture('handleOnChange', 480);
    assert.ok(Math.abs(f.internal.animatedPosition.value - 164.4) < 0.001, 'The same pull starts closing only after content reaches its top');
    f.internal.animatedScrollableStatus.value = C.SCROLLABLE_STATUS.LOCKED;
    f.internal.animatedSheetState.value = C.SHEET_STATE.OPENED;
    f.run('handleOnEndDrag', 0);
    f.gesture('handleOnEnd', 480, 1800);
    assert.deepEqual(f.destinations, [844]);
    assert.equal(f.offset.value, 0);
  }
});
