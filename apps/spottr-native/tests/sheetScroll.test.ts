import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSheetDrag } from '../src/ui/sheetScrollMath';

test('scroll reaches the top before the same gesture moves the sheet', () => {
  assert.deepEqual(splitSheetDrag(100, 180, 0, 900), { scroll: 80, sheetTranslation: 0 });
  assert.deepEqual(splitSheetDrag(180, 180, 0, 900), { scroll: 0, sheetTranslation: 0 });
  assert.deepEqual(splitSheetDrag(181, 180, 0, 900), { scroll: 0, sheetTranslation: 1 });
  assert.deepEqual(splitSheetDrag(500, 180, 0, 900), { scroll: 0, sheetTranslation: 320 });
});
test('reversing the same gesture returns the sheet before scrolling its content', () => {
  assert.deepEqual(splitSheetDrag(-60, 0, 100, 900), { scroll: 0, sheetTranslation: -60 });
  assert.deepEqual(splitSheetDrag(-100, 0, 100, 900), { scroll: 0, sheetTranslation: -100 });
  assert.deepEqual(splitSheetDrag(-140, 0, 100, 900), { scroll: 40, sheetTranslation: -100 });
});
test('empty content, upward scrolling and scroll bounds stay within range', () => {
  assert.deepEqual(splitSheetDrag(100, 0, 0, 0), { scroll: 0, sheetTranslation: 100 });
  assert.deepEqual(splitSheetDrag(-100, 0, 0, 900), { scroll: 100, sheetTranslation: 0 });
  assert.deepEqual(splitSheetDrag(-2000, 100, 0, 900), { scroll: 900, sheetTranslation: 0 });
});
test('grabbing a returning sheet preserves both its current gap and content offset', () => {
  assert.deepEqual(splitSheetDrag(0, 200, 50, 900), { scroll: 200, sheetTranslation: 0 });
  assert.deepEqual(splitSheetDrag(20, 200, 50, 900), { scroll: 200, sheetTranslation: 20 });
  assert.deepEqual(splitSheetDrag(-50, 200, 50, 900), { scroll: 200, sheetTranslation: -50 });
  assert.deepEqual(splitSheetDrag(-100, 200, 50, 900), { scroll: 250, sheetTranslation: -50 });
});
