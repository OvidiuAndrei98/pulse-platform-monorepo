import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
const { hooks, modules } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

test('a native glass press keeps the real hit target and callbacks without a second animation', () => {
  const h = hooks(); let taps = 0, releases = 0;
  const { MotionPressable } = modules({
    react: h.react,
    'react-native': { Pressable: 'Pressable' },
    'react-native-reanimated': { default: { createAnimatedComponent: () => 'AnimatedPressable' },
      useSharedValue: () => { throw Error('Static glass must not allocate a motion mapper'); } },
    './useReducedMotionPreference': { useReducedMotionPreference: () => false },
  }).load(path.resolve(__dirname, '../src/ui/MotionPressable.tsx'));
  const render = (disabled = false) => h.render(() => MotionPressable({ static: true,
    disabled, testID: 'native-button', accessibilityLabel: 'Continue', accessibilityRole: 'button',
    style: ({ pressed }: { pressed: boolean }) => ({ opacity: pressed ? 0.7 : 1 }),
    onPress: () => taps++, onPressOut: () => releases++, children: 'Continue',
  }));
  const target = render();
  assert.equal(target.type, 'Pressable'); assert.equal(target.props.testID, 'native-button');
  assert.equal(target.props.accessibilityLabel, 'Continue');
  assert.equal(target.props.style({ pressed: true })[0].opacity, 0.7);
  target.props.onPress(); target.props.onPressOut();
  assert.equal(taps, 1); assert.equal(releases, 1);
  assert.equal(render(true).props.disabled, true); h.unmount();
});
