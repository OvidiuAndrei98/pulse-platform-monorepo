import assert from "node:assert/strict";
import test from "node:test";
import { retargetTabIndicator, tabIndicatorPosition } from "../src/navigation/tabIndicatorTimeline";

test("a new scene joins the current animation without jumping or extending it", () => {
  const initial = retargetTabIndicator(null, 0, 0, false);
  const moving = retargetTabIndicator(initial, 255, 100, false);
  const halfway = tabIndicatorPosition(moving, 260);
  assert.ok(halfway > 0 && halfway < 255);
  const joined = retargetTabIndicator(moving, 255, 260, false);
  assert.equal(tabIndicatorPosition(joined, 260), halfway);
  assert.equal(tabIndicatorPosition(joined, 420), 255);
  assert.equal(joined.startedAt, 100);
});

test("rapid reversal starts at the current visual position and ends on the latest tab", () => {
  const initial = retargetTabIndicator(null, 0, 0, false);
  const toProfile = retargetTabIndicator(initial, 255, 100, false);
  const atTap = tabIndicatorPosition(toProfile, 220);
  const toHome = retargetTabIndicator(toProfile, 0, 220, false);
  assert.equal(tabIndicatorPosition(toHome, 220), atTap);
  assert.ok(tabIndicatorPosition(toHome, 300) < atTap);
  assert.equal(tabIndicatorPosition(toHome, 540), 0);
  assert.equal(tabIndicatorPosition(toHome, 10000), 0);
});

test("reduced motion stops an in-flight animation and stays aligned across a resize", () => {
  const initial = retargetTabIndicator(null, 0, 0, false);
  const moving = retargetTabIndicator(initial, 255, 100, false);
  const stopped = retargetTabIndicator(moving, 255, 150, true);
  assert.equal(tabIndicatorPosition(stopped, 150), 255);
  const resized = retargetTabIndicator(stopped, 300, 160, true);
  assert.equal(tabIndicatorPosition(resized, 160), 300);
  const restored = retargetTabIndicator(resized, 0, 170, false);
  assert.equal(tabIndicatorPosition(restored, 170), 300);
  assert.equal(tabIndicatorPosition(restored, 490), 0);
});
