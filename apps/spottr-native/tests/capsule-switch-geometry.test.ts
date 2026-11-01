import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { capsuleSwitchDrop, capsuleSwitchGeometry } from '../src/ui/capsuleSwitchGeometry';

test('the capsule stays within the track during grip, travel, impact and overshoot', () => {
  for (const count of [1, 2, 3, 4, 6]) for (const itemWidth of [62, 96, 180]) {
    for (let position = -.4; position <= count; position += .035) for (const pressure of [0, 1, 1.1]) for (const impact of [0, .5, 1, 1.1]) {
      const g = capsuleSwitchGeometry(position, count - 1, pressure, impact, itemWidth, count);
      const left = g.x + itemWidth * (1 - g.scaleX) / 2;
      const right = left + itemWidth * g.scaleX;
      assert.ok(left >= -1e-8 && right <= itemWidth * count + 1e-8, JSON.stringify({ count, position, pressure, impact, left, right }));
      assert.ok(g.scaleY * 36 < 40, 'Vertical deformation keeps space inside the 44px shell');
    }
  }
});
test('reduced motion retains selection and containment without deformation', () => {
  assert.deepEqual(capsuleSwitchGeometry(1.1, 1, 1, 1, 140, 2, true), { x: 140, scaleX: 1, scaleY: 1 });
});
test('drag release picks the nearest tab, with a bounded flick projection', () => {
  assert.equal(capsuleSwitchDrop(.7, 0, 2), 1);
  assert.equal(capsuleSwitchDrop(.3, 0, 2), 0);
  assert.equal(capsuleSwitchDrop(.4, 2, 2), 1);
  assert.equal(capsuleSwitchDrop(.1, 100, 2), 0);
  assert.equal(capsuleSwitchDrop(-3, -100, 2), 0);
  assert.equal(capsuleSwitchDrop(8, 100, 2), 1);
});
