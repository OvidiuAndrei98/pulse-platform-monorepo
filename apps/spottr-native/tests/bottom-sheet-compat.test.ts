import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
const { modules } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

test('installed Bottom Sheet omits native hook dependencies and preserves web dependencies', () => {
  const entry = path.join(path.dirname(require.resolve('@gorhom/bottom-sheet/package.json')), 'src/hooks/useAnimatedLayout.ts');
  for (const platform of ['ios', 'android', 'web']) {
    const dependencies: unknown[] = [];
    const { useAnimatedLayout } = modules({
      react: { useMemo: (fn: () => unknown) => fn(), useState: (fn: () => unknown) => [fn(), () => {}], useEffect: () => {} },
      'react-native': { Platform: { OS: platform }, Dimensions: { get: () => ({ width: 390, height: 844 }) } },
      'react-native-reanimated': { makeMutable: (value: unknown) => ({ value }), useAnimatedReaction: (_prepare: unknown, _effect: unknown, deps: unknown) => { dependencies.push(deps); } },
      '../constants': { INITIAL_LAYOUT_VALUE: -999, INITIAL_CONTAINER_LAYOUT: { offset: { top: 0, bottom: 0, left: 0, right: 0 } } },
    }).load(entry);
    useAnimatedLayout(undefined, 10, 20, false, false);
    assert.ok(dependencies.length >= 2, 'Exercise the actual installed layout hook');
    if (platform === 'web') assert.ok(dependencies.every(Array.isArray), 'Preserve explicit web dependencies');
    else assert.ok(dependencies.every(deps => deps === undefined), 'Native worklet inference must not receive ignored arguments');
  }
});
