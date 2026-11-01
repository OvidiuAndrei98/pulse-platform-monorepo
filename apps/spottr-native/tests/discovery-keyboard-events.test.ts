import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
const { find, hooks, modules } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

test('native keyboard subscriptions use latest callbacks and release every listener', () => {
  for (const platform of ['ios', 'android']) {
    const h = hooks(), react = { ...h.react, useLayoutEffect: h.react.useEffect };
    const subscriptions = new Map<string, () => void>(), calls: string[] = [], worklets: unknown[] = [];
    let removed = 0;
    const { useSearchKeyboardEvents } = modules({
      react,
      'react-native': { Platform: { OS: platform }, Keyboard: { addListener: (name: string, fn: () => void) => {
        subscriptions.set(name, fn); return { remove: () => { subscriptions.delete(name); removed++; } };
      } } },
      'react-native-keyboard-controller': { useGenericKeyboardHandler: (...args: unknown[]) => worklets.push(args) },
    }).load(path.resolve(__dirname, '../src/screens/useSearchKeyboardEvents.native.ts'));
    let generation = 1;
    const handlers = { onInteractive: () => {} };
    const render = () => h.render(() => {
      const current = generation;
      useSearchKeyboardEvents(handlers, {
        onWillHide: () => calls.push('will:' + current), onDidHide: () => calls.push('hide:' + current), onDidShow: () => calls.push('show:' + current),
      });
    });
    render(); generation = 2; render();
    subscriptions.get('keyboardDidShow')!(); subscriptions.get('keyboardWillHide')?.(); subscriptions.get('keyboardDidHide')!();
    assert.deepEqual(calls, platform === 'ios' ? ['show:2', 'will:2', 'hide:2'] : ['show:2', 'hide:2']);
    assert.ok(worklets.every(args => (args as unknown[]).length === 1), 'Native worklets receive no web dependency arrays');
    h.unmount(); assert.equal(subscriptions.size, 0); assert.equal(removed, platform === 'ios' ? 3 : 2);
  }
});

test('gesture area links the native Search input without visible accessory height or swipe reopening', () => {
  const { DiscoveryKeyboardArea } = modules({
    react: {}, 'react-native-keyboard-controller': { KeyboardGestureArea: 'KeyboardGestureArea' },
  }).load(path.resolve(__dirname, '../src/screens/DiscoveryKeyboardArea.native.tsx'));
  const child = { type: 'content' }, style = { flex: 1 };
  const area = DiscoveryKeyboardArea({ children: child, style });
  assert.equal(area.props.textInputNativeID, 'discovery-search'); assert.equal(area.props.offset, 0);
  assert.equal(area.props.showOnSwipeUp, false); assert.equal(area.props.interpolator, 'ios');
  assert.equal(area.props.children, child); assert.equal(area.props.style, style);
});

test('Search captures keyboard drags without scrolling or remounting native results', () => {
  const h = hooks(), navigation = { navigate() {} }, empty = () => {};
  const { DiscoveryScreen } = modules({
    react: h.react,
    'react-native': { Platform: { OS: 'ios' }, View: 'View', ScrollView: 'ScrollView', FlatList: 'FlatList',
      Modal: 'Modal', Pressable: 'Pressable', Keyboard: { dismiss: empty }, StyleSheet: { create: (x: unknown) => x, absoluteFill: {} },
      useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'lucide-react-native': { SlidersHorizontal: 'SlidersHorizontal' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 60, bottom: 34 }) },
    '@react-navigation/native': { useNavigation: () => navigation, useRoute: () => ({}), useScrollToTop: empty },
    '../usePreferences': { usePreferences: () => ({ copy: (s: string) => s }) },
    '../data/events': { categories: [] },
    '../data/queries': { useEvents: () => ({ items: [], loadMore: empty }), seedEvent: empty },
    '../ui/AccentPressable': { AccentPressable: 'AccentPressable' }, '../ui/GlassPressable': { GlassPressable: 'GlassPressable' },
    '../ui/ActionButton': { ActionButton: 'ActionButton' },
    '../ui/ActionIcon': { ActionIcon: 'ActionIcon' }, '../ui/Text': { Text: 'Text' }, '../ui/theme': { colors: {} },
    '../ui/common': { Feedback: 'Feedback', Loading: 'Loading', webListScrollProps: () => ({}) },
    '../ui/EventBrowseCard': { EventBrowseCard: 'EventBrowseCard' }, '../ui/VisiblePromotion': { VisiblePromotion: 'VisiblePromotion' },
    '../map/EventsMapPanel': { EventsMapPanel: 'EventsMapPanel' },
    '../navigation/useNavbarScroll': { useNavbarScroll: () => ({}) },
    '@tanstack/react-query': { useQuery: () => ({ data: [] }) }, '../data/api': { eventsApi: {} },
    '../../../pulse-app/src/features/events/promotions': { mixFeedPromotions: () => [] },
    '../../../pulse-app/src/features/events/dateFilters': { getEventDateRange: () => ({}) },
    '../../../pulse-app/src/features/events/useDebouncedDiscoverySearch': { useDebouncedDiscoverySearch: (q: string) => q },
    '../../../pulse-app/src/features/events/discoveryFilters': { activeDiscoveryStart: () => '2026-10-30', eventWithinDistance: () => true },
    './DiscoveryToolbar': { DiscoveryToolbar: 'DiscoveryToolbar' }, './DiscoveryCalendar': { DiscoveryCalendar: 'DiscoveryCalendar' },
    './DiscoveryKeyboardArea': { DiscoveryKeyboardArea: 'DiscoveryKeyboardArea' },
    './DiscoverySearchInteraction': { DiscoverySearchInteraction: 'DiscoverySearchInteraction' },
  }).load(path.resolve(__dirname, '../src/screens/DiscoveryScreen.tsx'));
  const render = () => h.render(DiscoveryScreen), byID = (root: any, id: string) => find(root, (n: any) => n.props?.testID === id);
  const toolbar = (root: any) => find(root, (n: any) => n.type === 'DiscoveryToolbar');
  let root = render(), list = byID(root, 'events-list'), resets = 0;
  assert.equal(root.props.style.paddingTop,0,'The iOS viewport extends beneath the header');
  assert.equal(root.props.children[0].props.style.position,'absolute');
  assert.equal(root.props.children[0].props.style.backgroundColor,undefined,'No opaque header backdrop');
  assert.equal(list.props.contentContainerStyle.paddingTop,124,'Only the initial content is inset below the controls');
  const ref = list.props.ref; let scrollEnabled = true;
  ref.current = { getNativeScrollRef: () => ({ setNativeProps: (props: any) => { scrollEnabled=props.scrollEnabled; } }), scrollToOffset: () => resets++ };
  const interaction = find(root, (n: any) => n.type === 'DiscoverySearchInteraction');
  const ih=hooks();
  const { DiscoverySearchInteraction }=modules({
    react: { ...ih.react, useLayoutEffect: ih.react.useEffect },
    'react-native': { Platform:{OS:'ios'}, ScrollView:'ScrollView', View:'View', StyleSheet:{absoluteFill:{}} },
  }).load(path.resolve(__dirname,'../src/screens/DiscoverySearchInteraction.tsx'));
  const gestureRender=()=>ih.render(()=>DiscoverySearchInteraction(interaction.props));
  let gesture=gestureRender(); const gestureRef=gesture.props.ref;
  assert.equal(gesture.props.pointerEvents,'none'); assert.equal(gesture.props.scrollEnabled,false);
  toolbar(root).props.onSearchActivityChange(true); gesture=gestureRender();
  assert.equal(scrollEnabled,false); assert.equal(gesture.props.ref,gestureRef); assert.equal(resets,0);
  assert.equal(gesture.props.pointerEvents,'auto');
  let releases=0;
  toolbar(root).props.keyboardGestureEndRef.current=()=>releases++;
  gesture.props.onScrollEndDrag(); assert.equal(releases,1);
  assert.equal(gesture.props.keyboardDismissMode,'interactive'); assert.equal(gesture.props.keyboardShouldPersistTaps,'never');
  assert.ok(root.props.children[0].props.style.zIndex>gesture.props.style[1].zIndex);
  assert.equal(find(gesture,(n:any)=>n.type==='FlatList'||n.type==='EventsMapPanel'),undefined);
  toolbar(root).props.onSearchActivityChange(false); gesture=gestureRender();
  assert.equal(scrollEnabled,true); assert.equal(gesture.props.pointerEvents,'none'); assert.equal(resets,0);
  assert.equal(gesture.props.ref,gestureRef,'Closing keeps the recognizer ready for the next opening');
  toolbar(root).props.onViewChange('map'); root=render();
  assert.ok(find(root,(n:any)=>n.type==='EventsMapPanel'));
  ih.unmount(); assert.equal(interaction.props.activityRef.current,null);
});
