import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const C = { SCROLLABLE_STATUS: { LOCKED: 0, UNLOCKED: 1 }, SHEET_STATE: { OPENED: 0, EXTENDED: 1, FILL_PARENT: 2 }, ANIMATION_STATUS: { RUNNING: 1, STOPPED: 0 } };
const shared = <T>(value: T) => ({ value, get() { return this.value; }, set(next: T | ((previous: T) => T)) { this.value = typeof next === 'function' ? (next as (v: T) => T)(this.value) : next; } });
function fixture(reentrant = true) {
  const offset = shared(0), commands: number[] = [];
  const internal = { animatedScrollableStatus: shared(C.SCROLLABLE_STATUS.LOCKED), animatedSheetState: shared(C.SHEET_STATE.OPENED), animatedHandleGestureState: shared(0), animatedScrollableState: shared({ contentOffsetY: 0 }), animatedAnimationState: shared({ status: C.ANIMATION_STATUS.STOPPED }) };
  let handlers: any, context: any = {};
  const dependencies: any = {
    react: { useCallback: (f: any) => f },
    'react-native-gesture-handler': { State: { ACTIVE: 4 } },
    'react-native-reanimated': { scrollTo: (_: unknown, _x: number, y: number) => {
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
  dependencies['@gorhom/bottom-sheet'] = { ...C, ...defaults, useBottomSheetInternal: () => internal };
  const hook = process.env.TEST_NATIVE_SCROLL_BASELINE ? defaults.useScrollEventsHandlersDefault : load('../src/ui/useSheetScrollEvents.ts').useSheetScrollEvents;
  handlers = hook({}, offset);
  return { internal, offset, commands, run(name: string, y: number) { handlers[name]({ contentOffset: { y } }, context); } };
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
