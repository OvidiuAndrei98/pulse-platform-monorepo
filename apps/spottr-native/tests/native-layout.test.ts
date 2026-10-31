import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test, { before } from 'node:test';
import ts from 'typescript';
import React from 'react';
import { loadYoga } from 'yoga-layout/load';
let Yoga: Awaited<ReturnType<typeof loadYoga>>;
before(async () => { Yoga = await loadYoga(); });

// Execute the actual JSX with deterministic hook/data fixtures. Layout is Yoga,
// as on iOS/Android: a browser CSS measurement cannot catch percentage-height bugs.
const flatten = (style: any): any => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};
function loadUI(relative: string, overrides: Record<string, any> = {}, platform = 'ios'): any {
  const cache = new Map();
  const colors = { text: '#fff', muted: '#aaa', accent: '#ff0044' };
  const fakeReact = { ...React, useEffect() {}, useCallback: (f: any) => f, useMemo: (f: any) => f(), useRef: (value: any) => ({ current: value }), useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}] };
  const rn = { View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal', Platform: { OS: platform }, useWindowDimensions: () => ({ width: 390, height: 844 }), StyleSheet: { create: (s: any) => s, flatten } };
  const deps: Record<string, any> = {
    react: { __esModule: true, default: fakeReact, ...fakeReact },
    'react-native': rn,
    'lucide-react-native': new Proxy({}, { get: (_, key) => String(key) }),
    '../usePreferences': { usePreferences: () => ({ copy: (key: string) => key, language: 'en' }) },
    '../auth/AuthProvider': { accountApi() { throw new Error('No network in layout tests'); }, useAuth: () => ({ user: { id: 'organizer', username: 'QA', email: 'qa@example.test' }, controller: {} }) },
    '../ui/Text': { Text: 'Text' },
    '../ui/common': { useOpenLink: () => ({}), Loading: 'Loading', Feedback: 'Feedback' },
    './common': { dColors: colors, useAction: () => ({}), useDashboardQuery: (path: string) => ({ data: path.endsWith('/plans') ? [{ id: 'one_day', placement: 'home_banner', amountRon: 50 }] : [] }), Action: 'Action', Field: 'Field', Select: 'Select', Confirm: 'Confirm' },
    './managementData': { invoiceStats: () => ({ issued: 0, inProgress: 0, attention: 0 }), financeSummary: () => ({ customerTotal: 0, platformFee: 0, tickets: 0 }) },
    './useOrganizerFlow': { useOrganizerFlow: () => ({}) },
    './usePromotionBilling': { usePromotionBilling: () => ({ details: {}, saved: { address: 'Test street', city: 'Test city' }, source: 'saved' }) },
    '../../../pulse-app/src/features/promotions/promotionBilling': { isPromotionBucharestAddress: () => false },
    ...overrides,
  };
  function load(file: string): any {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const output = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    runInNewContext(output, { exports, require: (name: string) => {
      if (deps[name]) return deps[name];
      if (name === './managementUi' || name === './FinanceSummary') return load(resolve(file, '..', name + '.tsx'));
      return {};
    }, console });
    return exports;
  }
  return load(resolve(__dirname, '../src', relative));
}
function elements(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements((node.props as any).children)];
}
function apply(node: any, style: any) {
  const s = flatten(style);
  if (s.height !== undefined) node.setHeight(s.height);
  if (s.minHeight !== undefined) node.setMinHeight(s.minHeight);
  if (s.flexGrow !== undefined) node.setFlexGrow(s.flexGrow);
  if (s.flexShrink !== undefined) node.setFlexShrink(s.flexShrink);
  if (s.flexBasis !== undefined) s.flexBasis === 'auto' ? node.setFlexBasisAuto() : node.setFlexBasis(s.flexBasis);
  if (s.flex !== undefined) node.setFlex(s.flex);
  if (s.padding !== undefined) node.setPadding(Yoga.EDGE_ALL, s.padding);
  if (s.gap !== undefined) node.setGap(Yoga.GUTTER_ALL, s.gap);
}

function sheetViewportStyle(platform: string, screenHeight = 874, fraction = .9, keyboardHeight = 0, containerHeight = screenHeight) {
  const shared = (value: any) => ({ get: () => value, set() {} });
  const internal = {
    animatedAnimationState: shared({}), animatedContentGestureState: shared(0), animatedHandleGestureState: shared(0),
    animatedLayoutState: shared({ containerHeight }),
    animatedKeyboardState: shared({ status: keyboardHeight ? 1 : 2, heightWithinContainer: keyboardHeight }),
  };
  const ui = loadUI('ui/AppSheet.tsx', {
    'react-native': { View: 'View', Platform: { OS: platform }, useWindowDimensions: () => ({ width: 402, height: screenHeight }), StyleSheet: { create: (s: any) => s } },
    '@gorhom/bottom-sheet': { __esModule: true, default: 'BottomSheet', ANIMATION_CONFIGS: {}, KEYBOARD_STATUS: { SHOWN: 1, HIDDEN: 2 }, useBottomSheetInternal: () => internal },
    'react-native-gesture-handler': { State: { BEGAN: 2, ACTIVE: 4 } },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, useAnimatedReaction() {}, useSharedValue: shared,
      useAnimatedStyle: (fn: any) => fn(), withSpring: (value: number) => value, withTiming: (value: number) => value },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 62 }) },
    '../../../pulse-app/src/components/ui/drawerDesign': { drawerDesign: { handleAreaHeight: 32 } },
    './SheetScrollBridge': { SheetScrollProvider: 'Provider', useSheetScrollSurface() {} },
  }, platform);
  const app = ui.AppSheet({ open: true, embedded: true, height: fraction, onClose() {}, label: 'Close' });
  const sheet = app.type(app.props);
  const boundary = elements(sheet).find(el => el.type.name === 'SheetGestureBoundary');
  const view = boundary.type(boundary.props);
  return view.props.style;
}

function scrollViewportHeight(style: any, parentHeight: number, contentHeight: number, handleSpace = 0) {
  const root = Yoga.Node.create(), boundary = Yoga.Node.create(), body = Yoga.Node.create(), scroll = Yoga.Node.create(), content = Yoga.Node.create();
  root.setWidth(402); root.setHeight(parentHeight);
  apply(boundary, style);
  body.setFlex(1); body.setMinHeight(0); body.setMargin(Yoga.EDGE_TOP, handleSpace);
  // RN ScrollView's baseVertical style plus the app's style={{flex:1}}.
  scroll.setFlex(1); scroll.setFlexGrow(1); scroll.setFlexShrink(1); scroll.setOverflow(Yoga.OVERFLOW_SCROLL);
  content.setHeight(contentHeight);
  root.insertChild(boundary, 0); boundary.insertChild(body, 0); body.insertChild(scroll, 0); scroll.insertChild(content, 0);
  root.calculateLayout(402, parentHeight, Yoga.DIRECTION_LTR);
  const viewport = scroll.getComputedHeight(); root.freeRecursive(); return viewport;
}

test('native sheet viewport is bounded by its open snap even when its ancestor grows beyond the screen', () => {
  // Real iPhone trace: content=1294.67, UIScrollView viewport=1471.67,
  // sheet top=87.4 on an 874pt screen. UIKit therefore selected targetY=0.
  const contentHeight = 1294.6666259765625, oversizedAncestor = 1471.6666666666665;
  for (const platform of ['ios', 'android']) {
    const viewport = scrollViewportHeight(sheetViewportStyle(platform), oversizedAncestor, contentHeight);
    assert.ok(Math.abs(viewport - 786.6) < 1, `${platform}: viewport grew to ${viewport} instead of the sheet's 786.6pt`);
    assert.ok(contentHeight - viewport > 500, 'Long content must have a positive scroll range after releasing the finger');
  }
});

test('native sheet viewport fits shorter parents, compact sheets and changing screen sizes', () => {
  for (const platform of ['ios', 'android']) for (const screen of [568, 874, 932]) for (const fraction of [.55, .9]) {
    const expected = Math.min(screen - 62 - 8, screen * fraction);
    const style = sheetViewportStyle(platform, screen, fraction);
    for (const handleSpace of [0, 32]) {
      const full = scrollViewportHeight(style, screen * 2, 2000, handleSpace);
      assert.ok(Math.abs(full - (expected - handleSpace)) < 1, 'Content must fit the sheet after resizing');
      const reduced = scrollViewportHeight(style, 280, 2000, handleSpace);
      assert.ok(Math.abs(reduced - (280 - handleSpace)) < 1, 'Content must shrink with the keyboard-adjusted parent');
    }
  }
});

test('browser sheet viewport keeps the existing flex sizing', () => {
  const style = sheetViewportStyle('web');
  for (const height of [420, 760]) assert.equal(scrollViewportHeight(style, height, 1800), height);
});

test('keyboard constrains the native viewport even if the ancestor still reports excess height', () => {
  for (const platform of ['ios', 'android']) {
    const style = sheetViewportStyle(platform, 874, .9, 340);
    const viewport = scrollViewportHeight(style, 1471.6667, 1294.6667, 32);
    assert.ok(Math.abs(viewport - (874 - 340 - 32)) < 1, `Keyboard left an oversized ${viewport}pt viewport`);
    const compact = scrollViewportHeight(sheetViewportStyle(platform, 874, .5, 340), 1471.6667, 1294.6667, 32);
    assert.ok(Math.abs(compact - (437 - 32)) < 1, 'A compact sheet should stay at its requested height when it already fits above the keyboard');
  }
  // adjustResize has already reduced the native root; Gorhom reports zero
  // remaining keyboard height inside that container.
  const resized = sheetViewportStyle('android', 874, .9, 0, 534);
  assert.equal(scrollViewportHeight(resized, 1471.6667, 1294.6667, 32), 502);
});
function gridCardHeight(cardStyle: any, contentHeight: number, viewportHeight: number) {
  const root = Yoga.Node.create(), grid = Yoga.Node.create(), cell = Yoga.Node.create(), card = Yoga.Node.create(), content = Yoga.Node.create();
  root.setWidth(350); root.setHeight(viewportHeight); root.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);
  grid.setFlexDirection(Yoga.FLEX_DIRECTION_ROW); grid.setFlexWrap(Yoga.WRAP_WRAP);
  cell.setWidth(350); apply(card, cardStyle); content.setHeight(contentHeight);
  root.insertChild(grid, 0); grid.insertChild(cell, 0); cell.insertChild(card, 0); card.insertChild(content, 0);
  root.calculateLayout(350, viewportHeight, Yoga.DIRECTION_LTR);
  const height = card.getComputedHeight(); root.freeRecursive(); return height;
}
test('native invoicing provider cards fit their text instead of filling the phone height', () => {
  const tree = loadUI('dashboard/Finance.tsx').Invoicing();
  const providers = elements(tree).filter(el => el.props.accessibilityRole === 'radio');
  assert.equal(providers.length, 2);
  for (const card of providers) for (const viewport of [568, 844, 932]) {
    const height = gridCardHeight(card.props.style, 64, viewport);
    assert.ok(height >= 96 && height <= 110, `Provider card became ${height}px on ${viewport}px screen`);
  }
});

test('long native event sheets expose fixed actions and reserve scroll space for them', () => {
  const event = { id: 'event', organizerId: 'other', title: 'Long event', description: 'Description. '.repeat(300), endTime: '2099-01-01', ticketTypes: [], lineup: [] };
  const dependencies = {
    '../data/queries': { useEvent: () => ({ data: event }) },
    '../data/api': { ApiError: class extends Error {} },
    '../data/useEventClock': { useEventClock: () => 0 },
    '../data/events': { availableTickets: () => [], isLive: () => false, formatDate: () => 'Date' },
    '@tanstack/react-query': { useQuery: () => ({ data: {} }) },
    '../usePreferences': { usePreferences: () => ({ copy: (key: string) => key, saved: [], ready: true }) },
    '../ui/theme': { colors: {} },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34 }) },
    '../ui/AppSheet': { AppSheet: 'AppSheet' },
    '../ui/AppSheetScrollView': { AppSheetScrollView: 'AppSheetScrollView' },
    '../ui/ToastProvider': { useToast: () => ({ show() {} }) },
  };
  for (const platform of ['ios', 'android', 'web']) for (const presentation of ['sheet', 'page']) {
    const ui = loadUI('screens/EventScreen.tsx', dependencies, platform);
    const tree = ui.EventScreen({ route: { params: { id: event.id, presentation } }, navigation: {} });
    const scroller = elements(tree).find(el => el.props.testID === 'event-content');
    assert.ok(scroller);
    const nativeSheet = platform !== 'web' && presentation === 'sheet';
    assert.equal(scroller.props.enableFooterMarginAdjustment === true, nativeSheet, 'Only native sheets reserve space for their overlaid footer');
    if (nativeSheet) {
      const sheet = elements(tree).find(el => el.type === 'AppSheet');
      assert.equal(sheet?.props.footer?.props.testID, 'event-actions', 'Native actions must use the dedicated fixed footer');
      assert.equal(elements(tree).some(el => el.props.testID === 'event-actions'), false, 'A long scroll container must not determine action-bar placement');
    } else {
      assert.equal(elements(tree).filter(el => el.props.testID === 'event-actions').length, 1, 'Pages and browser sheets retain their single flex footer');
    }
  }
});
test('native finance metric cards remain compact at small and large phone heights', () => {
  const tree = loadUI('dashboard/FinanceSummary.tsx').Finance();
  const grid = elements(tree).find(el => el.props.testID === 'finance-metrics');
  assert.ok(grid);
  for (const card of React.Children.toArray(grid.props.children) as any[]) {
    const compact = gridCardHeight(card.props.style, 96, 568), tall = gridCardHeight(card.props.style, 96, 932);
    assert.ok(compact < 190 && tall < 190, `Metric grew to ${compact}/${tall}px`);
    assert.equal(compact, tall, 'A metric must not grow with viewport height');
  }
});

test('all promotion choices and organizer profile panels size to content on native', () => {
  const promo = loadUI('dashboard/Promotions.tsx').Promotions({ events: [], profile: { verificationStatus: 'approved' } });
  const profile = loadUI('dashboard/DashboardAccount.tsx').DashboardProfile({});
  for (const [name, tree, minimum] of [['promotions', promo, 5], ['profile', profile, 3]] as const) {
    const cards = elements(tree).filter(el => el.type?.name === 'Grid').flatMap(el => React.Children.toArray(el.props.children) as any[]);
    assert.ok(cards.length >= minimum, `${name}: expected all grid cards in fixture`);
    for (const card of cards) {
      const short = gridCardHeight(card.props.style, 96, 568), tall = gridCardHeight(card.props.style, 96, 932);
      assert.ok(short < 230 && tall < 230, `${name} card grew to ${short}/${tall}px`);
      assert.equal(short, tall, `${name} card depends on viewport height`);
    }
  }
});

test('ordinary native sheet touches leave scroll unlocking and animation ownership to Gorhom', () => {
  let stopped = 0;
  const shared = (value: any) => ({ get: () => value, set: (next: any) => { value = typeof next === 'function' ? next(value) : next; } });
  const internal = {
    animatedAnimationState: shared({ status: 1, nextPosition: 84, nextIndex: 0, source: 1 }),
    animatedContentGestureState: shared(0), animatedHandleGestureState: shared(0),
    animatedLayoutState: shared({ containerHeight: 844 }), animatedKeyboardState: shared({ status: 2, heightWithinContainer: 0 }),
    stopAnimation: () => { stopped++; }, animateToPosition() {},
  };
  const ui = loadUI('ui/AppSheet.tsx', {
    '@gorhom/bottom-sheet': { __esModule: true, default: 'BottomSheet', ANIMATION_CONFIGS: {}, KEYBOARD_STATUS: { SHOWN: 1, HIDDEN: 2 }, ANIMATION_STATUS: { RUNNING: 1, STOPPED: 0 }, useBottomSheetInternal: () => internal },
    'react-native-gesture-handler': { State: { BEGAN: 2, ACTIVE: 4 } },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, runOnUI: (fn: any) => fn, useAnimatedReaction() {}, useSharedValue: shared,
      useAnimatedStyle: (fn: any) => fn(), withSpring: (value: number) => value, withTiming: (value: number) => value },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '../../../pulse-app/src/components/ui/drawerDesign': { drawerDesign: {} },
    './SheetScrollBridge': { SheetScrollProvider: 'Provider', useSheetScrollSurface() {} },
  });
  const footer = React.createElement('View', { testID: 'event-actions' });
  const app = ui.AppSheet({ open: true, embedded: true, onClose() {}, label: 'Close', footer });
  const sheet = app.type(app.props);
  const boundary = elements(sheet).find(el => el.type.name === 'SheetGestureBoundary');
  assert.ok(boundary);
  const view = boundary.type(boundary.props);
  view.props.onTouchStart?.();
  assert.equal(stopped, 0, 'A plain touch stopped the sheet short of its expanded snap and kept native scrolling locked');
  const bottomSheet = elements(sheet).find(el => el.type === 'BottomSheet');
  assert.equal(typeof bottomSheet?.props.footerComponent, 'function', 'Actions must be positioned by the native sheet footer, outside scrolling content');
  assert.equal(sheet.props.value, footer, 'The stable footer receives the current actions');
  const updated = app.type({ ...app.props, footer: React.createElement('View') });
  assert.equal(elements(updated).find(el => el.type === 'BottomSheet')?.props.footerComponent, bottomSheet.props.footerComponent, 'Refreshing tickets must not remount the footer');
});

test('native sheet handle dismisses on tap without a diagnostic long-press action', () => {
  let closed = 0;
  const pan = new Proxy({}, { get: () => () => pan });
  const ui = loadUI('ui/AppSheet.tsx', {
    'react-native': { View: 'View', Pressable: 'Pressable', Platform: { OS: 'ios' },
      useWindowDimensions: () => ({ height: 844 }), StyleSheet: { create: (s: any) => s } },
    '@gorhom/bottom-sheet': { __esModule: true, default: 'BottomSheet', ANIMATION_CONFIGS: {}, useBottomSheetGestureHandlers: () => ({ handlePanGestureHandler: {} }) },
    'react-native-gesture-handler': { Gesture: { Pan: () => pan }, GestureDetector: 'GestureDetector' },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59 }) },
    '../../../pulse-app/src/components/ui/drawerDesign': { drawerDesign: {} },
    './SheetScrollBridge': { SheetScrollProvider: 'Provider' },
  });
  const app = ui.AppSheet({ open: true, embedded: true, label: 'Close', onClose() {} });
  const sheet = app.type(app.props);
  const overlay = elements(sheet).find(el => el.type.name === 'SheetHandleOverlay');
  assert.ok(overlay);
  const tree = overlay.type({ ...overlay.props, onClose: () => closed++ });
  const handle = elements(tree).find(el => el.props.testID === 'sheet-handle');
  assert.equal(handle.props.onLongPress, undefined);
  handle.props.onPress();
  assert.equal(closed, 1, 'An ordinary tap must still dismiss normally');
});
