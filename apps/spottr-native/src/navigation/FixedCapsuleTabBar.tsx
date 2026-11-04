import { MAIN_TAB_LABELS } from '@packages/app-core/navigation/mainTabs';
import React, { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { usePreferences } from '../usePreferences';
import { ToastHost } from '../ui/ToastHost';
import { useReducedMotionPreference } from '../ui/useReducedMotionPreference';
import type { NativeTabBarProps } from './NativeTabBar';
import { TabBarIcon } from './TabBarIcon';
import { TabBarSurface } from './TabBarSurface';
import { TabBarIndicatorSurface } from './TabBarIndicatorSurface';
import { tabCapsuleFollowSpring, tabCapsulePickupSpring, tabCapsulePressSpring, tabCapsuleReleaseSpring, withTabTravel } from './tabCapsuleSpring';
import { NavbarScrollContext, navbarCompactScale } from './useNavbarScroll';
import { getTabCapsuleGeometry, tabBarInset, tabBarWidthFromSpacing } from './tabCapsuleGeometry';
import { advanceTabMotion, idleTabMotion, startTabMotion, type TabMotionState } from './tabSynchronizedMotion';

const labels = MAIN_TAB_LABELS;
const edgeTravel = 8;
const barInset = tabBarInset;

const FixedTabIndicator = React.memo(function FixedTabIndicator({ motion, blobWidth, left }: {
  motion: SharedValue<TabMotionState>; blobWidth: number; left: number;
}) {
  const indicatorStyle = useAnimatedStyle(() => {
    const pose = motion.value.pose;
    return { transform: [{ translateX: pose.indicatorX }, { scaleX: pose.indicatorScaleX }, { scaleY: pose.indicatorScaleY }] };
  });
  return <Animated.View testID="tab-indicator" pointerEvents="none" style={[s.indicator, { width: blobWidth, left }, indicatorStyle]}>
    <TabBarIndicatorSurface />
  </Animated.View>;
});

/** Increasing resistance keeps the capsule close to the glass at either end. */
function resistedPosition(value: number, limit: number) {
  'worklet';
  const bound = Math.min(limit, Math.max(0, value));
  const excess = value - bound;
  return bound + excess * edgeTravel / (Math.abs(excess) + 32);
}

/** One glass navbar for Expo Go and installed builds; gestures stay on the UI thread. */
export function FixedCapsuleTabBar({ state, navigation, insets, activeIndex = state.index, onSelectTab, indicatorMotion, interactionEnabled = true }: NativeTabBarProps) {
  const { copy } = usePreferences('copy');
  const reducedMotion = useReducedMotionPreference();
  const [width, measure] = useState(0);
  const previousSpacing = useRef(0);
  const localPosition = useSharedValue(0);
  const localInteraction = useSharedValue(0);
  const localCompact = useSharedValue(0);
  const scrollController = useContext(NavbarScrollContext);
  const compact = scrollController?.compact ?? localCompact;
  const onBarTouch = scrollController?.onTouch;
  const position = indicatorMotion?.position ?? localPosition;
  const gestureCommand = indicatorMotion?.gestureCommand;
  const interaction = indicatorMotion?.interaction ?? localInteraction;
  const sharedMotion = Boolean(indicatorMotion);
  const origin = useSharedValue(0);
  const tracking = useSharedValue(false);
  const dragTarget = useSharedValue(0);
  const pickupOffset = useSharedValue(0);
  const controlledIndex = useSharedValue(activeIndex);
  const interactive = useSharedValue(interactionEnabled);
  const count = state.routes.length;
  const barWidth = width || tabBarWidthFromSpacing(indicatorMotion?.itemWidth ?? 0, count);
  const geometry = useMemo(() => getTabCapsuleGeometry(barWidth, count), [barWidth, count]);
  // The shared motion's itemWidth is the distance between centers, not the
  // visual width. Route acknowledgements continue using the same coordinates.
  const itemWidth = geometry.spacing;
  const { limit, firstCenter } = geometry;
  const motion = useSharedValue(idleTabMotion(0, geometry));
  const begin = useCallback((target: number) => {
    'worklet';
    motion.value = startTabMotion(motion.value, position.value, target, geometry, performance.now());
  }, [motion, position, geometry]);

  // One raw-position sample publishes one complete pose. Route acknowledgements
  // cannot restart a contact clock; there are no separate deformation springs.
  useAnimatedReaction(
    () => ({ x: position.value, held: tracking.value, grip: interaction.value, reduced: reducedMotion,
      width: barWidth, spacing: itemWidth }),
    current => {
      motion.value = advanceTabMotion(motion.value, current.x, geometry, performance.now(), current.grip, current.held, current.reduced);
    },
  );

  useLayoutEffect(() => {
    runOnUI(() => {
      interactive.value = interactionEnabled;
      if (!interactionEnabled) {
        tracking.value = false;
        cancelAnimation(pickupOffset);
        pickupOffset.value = 0;
        interaction.value = withSpring(0, tabCapsuleReleaseSpring);
      }
    })();
  }, [interactionEnabled, interactive, tracking, pickupOffset, interaction]);

  useLayoutEffect(() => {
    // Count/proportion changes need to update the shared route destinations
    // even when the native outer View keeps exactly the same layout width.
    if (width && itemWidth > 0 && indicatorMotion?.itemWidth !== itemWidth) indicatorMotion?.measure(itemWidth);
  }, [width, itemWidth, indicatorMotion?.itemWidth, indicatorMotion?.measure]);

  useLayoutEffect(() => {
    if (!itemWidth) return;
    const resized = previousSpacing.current !== itemWidth;
    runOnUI(() => {
      controlledIndex.value = activeIndex;
      const request = gestureCommand?.value;
      // A route acknowledgement can arrive after the next finger has already
      // picked up the capsule. It must not cancel that newer gesture. External
      // navigation and geometry changes still release the current grip.
      if (resized || !request || (!request.pending && request.index !== activeIndex)) {
        tracking.value = false;
        cancelAnimation(pickupOffset);
        pickupOffset.value = 0;
      }
      if (resized) motion.value = idleTabMotion(position.value, geometry, performance.now());
      else if ((!request || !request.pending) && motion.value.target !== activeIndex * itemWidth && !tracking.value) begin(activeIndex * itemWidth);
    })();
    // The provider owns a shared spring across stack scenes. A newly mounted
    // navbar joins it without resetting it or starting another animation.
    if (!sharedMotion) {
      const target = activeIndex * itemWidth;
      runOnUI(() => {
        if (resized) {
          position.value = target;
          motion.value = idleTabMotion(target, geometry, performance.now());
        } else { begin(target); position.value = withTabTravel(target); }
      })();
    }
    previousSpacing.current = itemWidth;
  }, [activeIndex, itemWidth, width, sharedMotion, position, tracking, pickupOffset, controlledIndex, gestureCommand, motion, geometry, begin]);

  // Ease the initial grip offset away, then keep following with a little weight.
  // Retargeting this UI-thread spring carries motion through quick reversals.
  useAnimatedReaction(
    () => interactive.value && tracking.value ? dragTarget.value + pickupOffset.value : null,
    value => { if (value !== null) position.value = withSpring(value, tabCapsuleFollowSpring); },
  );

  const selection = useRef({ state, navigation, onSelectTab, activeIndex, interactionEnabled });
  useLayoutEffect(() => { selection.current = { state, navigation, onSelectTab, activeIndex, interactionEnabled }; }, [state, navigation, onSelectTab, activeIndex, interactionEnabled]);
  const select = useCallback((index: number, animatedOnUI = false, gestureId?: number) => {
    const { state, navigation, onSelectTab, activeIndex, interactionEnabled } = selection.current;
    // A valid UI-thread tap may reach JS after another tap changed the scene.
    // The provider still rejects gestures when a pushed page covers all bars.
    if (!interactionEnabled && !(animatedOnUI && gestureId !== undefined && onSelectTab)) return;
    if (!animatedOnUI) {
      compact.value = withSpring(0, tabCapsulePressSpring);
      onBarTouch?.();
    }
    const route = Number.isInteger(index) ? state.routes[index] : undefined;
    if (!route) return;
    let accepted = true;
    if (onSelectTab) accepted = onSelectTab(route.name, gestureId) !== false;
    else {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      accepted = !event.defaultPrevented;
      if (index !== activeIndex && accepted) navigation.navigate(route.name, route.params);
    }
    if (!accepted || !animatedOnUI) {
      const target = (accepted ? index : activeIndex) * itemWidth;
      runOnUI(() => { begin(target); position.value = withTabTravel(target); })();
    }
  }, [compact, onBarTouch, itemWidth, position, begin]);

  // Covering Tabs with a native page only gates input. Reinstalling recognizers
  // and animation mappers on every push/pop interrupts the same physical bar.
  const pan = useMemo(() => Gesture.Pan().enabled(itemWidth > 0).maxPointers(1)
    .activeOffsetX([-4, 4]).failOffsetY([-8, 8])
    .onBegin(() => {
      if (!interactive.value) return;
      compact.value = withSpring(0, tabCapsulePressSpring);
      if (onBarTouch) runOnJS(onBarTouch)();
    })
    .onStart(event => {
      if (!interactive.value) return;
      // BEGAN also runs for ordinary tab taps. Enlarge only after the pan
      // becomes an actual drag, so tap-driven travel keeps its resting size.
      interaction.value = withSpring(1, tabCapsulePressSpring);
      cancelAnimation(position);
      // Read the displayed location when picking up an in-flight bounce.
      position.value = Math.min(limit + edgeTravel, Math.max(-edgeTravel, position.value));
      cancelAnimation(pickupOffset);
      const physicalStart = event.x - event.translationX;
      origin.value = physicalStart - firstCenter;
      dragTarget.value = resistedPosition(origin.value + event.translationX, limit);
      pickupOffset.value = position.value - dragTarget.value;
      tracking.value = true;
      if (pickupOffset.value) pickupOffset.value = withSpring(0, tabCapsulePickupSpring);
    })
    .onUpdate(event => {
      if (!tracking.value) return;
      dragTarget.value = resistedPosition(origin.value + event.translationX, limit);
    })
    .onEnd((_event, success) => {
      if (!tracking.value) return;
      tracking.value = false;
      cancelAnimation(pickupOffset);
      if (!success) {
        begin(controlledIndex.value * itemWidth);
        position.value = withTabTravel(controlledIndex.value * itemWidth);
        return;
      }
      // A quick release commits the finger's target even while pickup is running.
      const index = Math.max(0, Math.min(count - 1, Math.round(dragTarget.value / itemWidth)));
      const request = gestureCommand?.value;
      const gestureId = request ? request.id + 1 : undefined;
      if (gestureCommand && request) gestureCommand.value = { ...request, id: gestureId!, index, pending: true };
      begin(index * itemWidth);
      position.value = withTabTravel(index * itemWidth);
      runOnJS(select)(index, true, gestureId);
    })
    .onFinalize(() => {
      interaction.value = withSpring(0, tabCapsuleReleaseSpring);
      if (!tracking.value) return;
      tracking.value = false;
      cancelAnimation(pickupOffset);
      begin(controlledIndex.value * itemWidth);
      position.value = withTabTravel(controlledIndex.value * itemWidth);
    }), [interactive, itemWidth, firstCenter, limit, count, onBarTouch, select, position, compact, interaction, pickupOffset, tracking, origin, dragTarget, controlledIndex, gestureCommand, begin]);
  // Each tab owns its tap recognizer. A whole-bar Tap treats overlapping
  // contacts on different tabs as one unfinished gesture on iOS, swallowing
  // rapid alternations before they ever reach the navigation queue.
  const taps = useMemo(() => Array.from({ length: count }, (_, index) =>
    Gesture.Tap().enabled(itemWidth > 0).maxDuration(10000)
    .requireExternalGestureToFail(pan)
    .onEnd((_event, success) => {
      if (!success || !interactive.value) return;
      const target = index * itemWidth;
      const distanceInTabs = Math.abs(target - position.value) / itemWidth;
      const request = gestureCommand?.value;
      const gestureId = request ? request.id + 1 : undefined;
      if (gestureCommand && request) gestureCommand.value = { ...request, id: gestureId!, index, pending: true };
      begin(target);
      position.value = withTabTravel(target, distanceInTabs);
      runOnJS(select)(index, true, gestureId);
    })), [interactive, itemWidth, count, select, position, gestureCommand, pan, begin]);
  // All transform mappers read the exact same published frame.
  const barSize = { width: itemWidth > 0 ? barWidth : '100%' } as const;
  const barMotion = useAnimatedStyle(() => ({ transform: [
    { translateX: motion.value.pose.barX },
    { scaleX: motion.value.pose.barScaleX },
    { scaleY: motion.value.pose.barScaleY },
  ] }));
  const trackMotion = useAnimatedStyle(() => ({
    transform: [
      { translateX: motion.value.pose.trackX },
      { scaleX: motion.value.pose.trackScaleX },
      { scaleY: motion.value.pose.trackScaleY },
    ],
  }));
  const compactMotion = useAnimatedStyle(() => ({ transform: [
    { scale: 1 - compact.value * (1 - navbarCompactScale) },
  ] }));

  return <View collapsable={false} pointerEvents={interactionEnabled ? 'box-none' : 'none'} accessibilityElementsHidden={!interactionEnabled} style={[s.position, { bottom: Math.max(12, insets.bottom - 12) }]}>
    <GestureDetector gesture={pan}>
      <View testID="tab-hit-area" collapsable={false} style={s.hitArea} onLayout={event => {
        const nextWidth = Math.max(0, event.nativeEvent.layout.width);
        if (!nextWidth) return;
        measure(nextWidth);
      }}>
        <Animated.View testID="tab-compact-motion" style={compactMotion}>
          <Animated.View testID="tab-bar-motion" style={[barSize, barMotion]}>
            <TabBarSurface testID="tab-bar" style={s.bar}>
              <Animated.View testID="tab-track" collapsable={false} style={[s.track, { width: itemWidth > 0 ? geometry.trackWidth : '100%' }, trackMotion]}>
                {itemWidth > 0 && <FixedTabIndicator motion={motion} blobWidth={geometry.blobWidth} left={geometry.blobLeft} />}
                {/* Account changes reset the Profile screen's route key, not
                    its physical button or recognizer in this persistent bar. */}
                {state.routes.map((route, index) => <GestureDetector key={route.name} gesture={taps[index]!}>
                  <View collapsable={false} testID={`tab-${route.name}`} accessible
                  accessibilityRole="tab" accessibilityLabel={copy(labels[index] ?? 'nav.home')}
                  accessibilityState={{ selected: index === activeIndex }} style={[s.tab, itemWidth > 0 && { flex: 0, width: geometry.tabs[index]!.width }]}
                  onAccessibilityTap={() => select(index)}
                  accessibilityActions={[{ name: 'activate' }]}
                  onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') select(index); }}>
                  <View testID={`tab-icon-${route.name}`} pointerEvents="none" style={itemWidth > 0 ? { transform: [{ translateX: geometry.tabs[index]!.iconOffset }] } : undefined}>
                    <TabBarIcon index={index} active={index === activeIndex} size={26} color="white" strokeWidth={2} />
                  </View>
                  </View>
                </GestureDetector>)}
              </Animated.View>
            </TabBarSurface>
          </Animated.View>
        </Animated.View>
      </View>
    </GestureDetector>
    <ToastHost placement="navbar" />
  </View>;
}

const s = StyleSheet.create({
  position: { position: 'absolute', left: 20, right: 20 },
  hitArea: { height: 62, width: '100%' },
  bar: { height: 62, width: '100%', padding: barInset, borderRadius: 31, overflow: 'hidden' },
  track: { flex: 1, flexDirection: 'row', position: 'relative' },
  indicator: { position: 'absolute', top: 1, bottom: 1, left: 0, borderRadius: 26 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 27 },
});
