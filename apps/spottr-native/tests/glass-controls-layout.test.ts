import assert from 'node:assert/strict';
import test from 'node:test';
import { loadYoga } from 'yoga-layout/load';
import { glassButtonStyles } from '../src/ui/glassButtonStyles';

test('native glass stays circular in stretched rows, columns and full-width auth containers', async () => {
  const y = await loadYoga();
  for (const width of [320, 390, 430, 768]) for (const row of [false, true]) {
    for (const source of [
      { width: 40, height: 40, borderRadius: 20 },
      { width: 32, height: 32, borderRadius: 16, padding: 8 },
      { height: 48, minWidth: 48, borderRadius: 99, paddingHorizontal: 16 },
      { width: '100%' as const, height: 44, flex: 1, alignSelf: 'stretch' as const },
    ]) {
      const { surface, control } = glassButtonStyles(source, false);
      const root = y.Node.create(), material = y.Node.create(), button = y.Node.create();
      root.setWidth(width); root.setHeight(844);
      root.setFlexDirection(row ? y.FLEX_DIRECTION_ROW : y.FLEX_DIRECTION_COLUMN);
      root.setAlignItems(y.ALIGN_STRETCH);
      material.setWidth(surface.width as number); material.setHeight(surface.height as number);
      material.setMinWidth(surface.minWidth as number); material.setMinHeight(surface.minHeight as number);
      material.setMaxWidth(surface.maxWidth as number); material.setMaxHeight(surface.maxHeight as number);
      material.setFlexGrow(surface.flexGrow!); material.setFlexShrink(surface.flexShrink!);
      button.setPositionType(control.position === 'absolute' ? y.POSITION_TYPE_ABSOLUTE : y.POSITION_TYPE_RELATIVE);
      for (const [edge, key] of [[y.EDGE_LEFT, 'left'], [y.EDGE_RIGHT, 'right'], [y.EDGE_TOP, 'top'], [y.EDGE_BOTTOM, 'bottom']] as const)
        button.setPosition(edge, control[key] as number);
      material.insertChild(button, 0); root.insertChild(material, 0); root.calculateLayout(undefined, undefined, y.DIRECTION_LTR);
      const bounds = material.getComputedLayout(), hitArea = button.getComputedLayout();
      assert.equal(bounds.width, bounds.height, 'The material must never turn into an oval');
      assert.ok(bounds.width >= 44 && bounds.width <= 48, 'No expanding login/dashboard surface');
      assert.equal(surface.borderRadius, bounds.width / 2);
      assert.equal(hitArea.width, bounds.width, 'Entire visible circle is tappable');
      assert.equal(hitArea.height, bounds.height);
      root.freeRecursive();
    }
  }
});

test('disabled glass dims the icon without fading the native material or moving its geometry', () => {
  const style = { position: 'absolute' as const, top: 12, right: 12, height: 44 };
  const enabled = glassButtonStyles(style, false), disabled = glassButtonStyles(style, true);
  assert.deepEqual(disabled.surface, enabled.surface);
  assert.equal(disabled.surface.opacity, 1);
  assert.equal(disabled.surface.top, 12);
  assert.equal(disabled.surface.right, 12);
  assert.equal(disabled.control.opacity, 0.4);
});
