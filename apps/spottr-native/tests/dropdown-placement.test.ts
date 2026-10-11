import test from "node:test";
import assert from "node:assert/strict";
import { dropdownPlacement } from "../src/dashboard/dropdownPlacement";

test("a normal dropdown opens immediately below its field without covering the whole screen", () => {
  assert.deepEqual(
    dropdownPlacement(
      { x: 20, y: 100, width: 350, height: 44 },
      { width: 390, height: 844 },
      240,
    ),
    { left: 20, top: 152, width: 350, height: 240 },
  );
});
test("a field near the bottom opens upwards, leaving all choices accessible", () => {
  assert.deepEqual(
    dropdownPlacement(
      { x: 20, y: 700, width: 350, height: 44 },
      { width: 390, height: 844 },
      240,
    ),
    { left: 20, top: 452, width: 350, height: 240 },
  );
});
test("small viewports clamp both width and height inside their margins", () => {
  const menu = dropdownPlacement(
    { x: -20, y: 110, width: 600, height: 44 },
    { width: 320, height: 200 },
    240,
  );
  assert.deepEqual(menu, { left: 8, top: 8, width: 304, height: 94 });
  assert.ok(menu.left + menu.width <= 312);
});
test("a right-aligned field stays within the viewport and a short menu preserves its height", () => {
  assert.deepEqual(
    dropdownPlacement(
      { x: 340, y: 100, width: 80, height: 44 },
      { width: 390, height: 844 },
      52,
    ),
    { left: 302, top: 152, width: 80, height: 52 },
  );
});
