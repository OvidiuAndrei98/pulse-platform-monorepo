import assert from 'node:assert/strict';
import test from 'node:test';
import { containTabCapsule, getTabCapsuleFrame, getTabCapsuleGeometry, tabCapsuleEdgeMargin } from '../src/navigation/tabCapsuleGeometry';

const close = (actual: number, expected: number, tolerance = 0.000001) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('five tabs match the reference proportions without changing the existing outer bar', () => {
  // A 384-point viewport keeps Spottr's existing 20-point side margins.
  const g = getTabCapsuleGeometry(344, 5);
  close(g.spacing, 64.8543689320);
  close(g.blobWidth, 74.5825242718);
  [62.291262, 127.145631, 192, 256.854369, 321.708738].forEach((center, i) => close(20 + g.tabs[i]!.center, center, 0.000001));
  close(g.blobWidth / g.spacing, 1.15);
  close((g.blobWidth - g.spacing) / 2, 4.8640776699);
  close(g.tabs[0]!.center - g.blobWidth / 2, 5);
  close(g.width - g.tabs[4]!.center - g.blobWidth / 2, 5);
  // Keep the latest requested equal horizontal/vertical inset, while the
  // outer Spottr bar retains its original dimensions (slightly wider than IG).
  const phone = getTabCapsuleGeometry(362, 5), pixelsPerPoint = 736 / 402;
  close((20 + phone.firstCenter) * pixelsPerPoint, 117.72516, 0.01);
  close(phone.blobWidth * pixelsPerPoint, 143.90803, 0.01);
});

test('all resting positions share one width and align with evenly spaced icons at different viewport widths', () => {
  for (const width of [280, 320, 344, 362, 390, 500, 720]) {
    const g = getTabCapsuleGeometry(width, 5);
    g.tabs.forEach((tab, index) => {
      const frame = getTabCapsuleFrame(index * g.spacing, g.limit, g.blobWidth, 0, 0, 1, 0);
      close(frame.scaleX, 1);
      close(4 + g.blobLeft + frame.translateX + g.blobWidth / 2, tab.center);
      close(4 + tab.left + tab.width / 2 + tab.iconOffset, tab.center);
      assert.ok(tab.width >= 44, 'Each tab retains an accessible, non-overlapping target');
      if (index > 0) {
        close(tab.center - g.tabs[index - 1]!.center, g.spacing);
        close(tab.left, g.tabs[index - 1]!.left + g.tabs[index - 1]!.width);
      }
    });
    close(g.tabs[4]!.left + g.tabs[4]!.width, g.trackWidth);
  }
});

test('normal travel is unchanged and extreme edge motion stays inside the extending glass without resizing', () => {
  for (const width of [280, 344, 390, 720]) {
    const g = getTabCapsuleGeometry(width, 5);
    for (let x = 0; x <= g.limit; x += 0.25) {
      close(getTabCapsuleFrame(x, g.limit, g.blobWidth, 0, 0, 1, 0).translateX, x);
    }
    for (const direction of [-1, 1]) for (const interaction of [0, 0.5, 1, 1.15]) for (const response of [-0.2, 0, 0.5, 1]) {
      for (let over = -20; over <= 30; over += 0.1) {
        const x = direction < 0 ? -over : g.limit + over;
        const contact = Math.max(0, 1 - Math.max(0, direction < 0 ? x : g.limit - x) / 12);
        const extension = interaction > 0 ? Math.max(Math.min(1, Math.max(0, over) / 8) * 3, response * 8 * contact) : response * 8 * contact;
        const f = getTabCapsuleFrame(x, g.limit, g.blobWidth, interaction, response, direction, extension);
        const growth = g.blobWidth * (f.scaleX - 1) / 2;
        const left = tabCapsuleEdgeMargin + f.translateX - growth;
        const right = tabCapsuleEdgeMargin + f.translateX + g.blobWidth + growth;
        assert.ok(left >= (direction < 0 ? -extension : 0) + 0.49999);
        assert.ok(right <= width + (direction > 0 ? extension : 0) - 0.49999);
        const pressure = Math.min(1, Math.max(0, over) / 8);
        close(f.scaleX, 1 + interaction * 0.08 * (1 - pressure) - pressure * 0.05 + response * 0.045, 0.000001);
      }
    }
  }
});

test('edge containment is monotonic, symmetric and has no position or velocity discontinuity', () => {
  const lower = -5, upper = 270;
  let previous = -Infinity;
  for (let x = -30; x <= 300; x += 0.01) {
    const y = containTabCapsule(x, lower, upper);
    assert.ok(y >= previous && y > lower && y < upper);
    close(y + containTabCapsule(lower + upper - x, lower, upper), lower + upper);
    previous = y;
  }
  for (const join of [lower + 1.5, upper - 1.5]) {
    const delta = 0.00001;
    close((containTabCapsule(join + delta, lower, upper) - containTabCapsule(join - delta, lower, upper)) / (2 * delta), 1, 0.00001);
  }
});
