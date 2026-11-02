import { MAIN_TAB_LABELS } from '@packages/app-core/navigation/mainTabs';
import React, { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming, type DerivedValue, type SharedValue } from 'react-native-reanimated';
import { usePreferences } from '../usePreferences';
import { ToastHost } from '../ui/ToastHost';
import type { NativeTabBarProps } from './NativeTabBar';
import { TabBarIcon } from './TabBarIcon';
import { TabBarSurface } from './TabBarSurface';
import { TabBarIndicatorSurface } from './TabBarIndicatorSurface';
import { tabCapsuleFollowSpring, tabCapsuleImpactTiming, tabCapsulePickupSpring, tabCapsulePressSpring, tabCapsuleReleaseSpring, withTabTravel } from './tabCapsuleSpring';
import { NavbarScrollContext, navbarCompactScale } from './useNavbarScroll';

const labels = MAIN_TAB_LABELS;
const edgeTravel = 8;
const barInset = 4;
const impactExtension = 8;

/** Increasing resistance keeps the capsule close to the glass at either end. */
function resistedPosition(value: number, limit: number) {
  'worklet';
  const bound = Math.min(limit, Math.max(0, value));
  const excess = value - bound;
  return bound + excess * edgeTravel / (Math.abs(excess) + 32);
}

// Route/focus updates must not recreate the travelling indicator's mapper.
// Background scenes follow the same position, ready for a seamless handoff.
const FixedTabIndicator = React.memo(function FixedTabIndicator({ position, interaction, edgeResponse, edgeDirection, extension, itemWidth, limit }: {
  position: SharedValue<number>; interaction: SharedValue<number>; edgeResponse: SharedValue<number>;
  edgeDirection: SharedValue<number>; extension: DerivedValue<number>; itemWidth: number; limit: number;
}) {
  const motion = useAnimatedStyle(() => {
    const x = Math.min(limit + edgeTravel, Math.max(-edgeTravel, position.value));
    const pressure = Math.abs(x - Math.min(limit, Math.max(0, x))) / edgeTravel;
    const contact = Math.max(0, 1 - Math.max(0, Math.min(x, limit - x)) / 12);
    return { transform: [
      { translateX: x + edgeDirection.value * extension.value * contact },
      { scaleX: 1 + interaction.value * 0.08 * (1 - pressure) - pressure * 0.05 + edgeResponse.value * 0.045 },
      { scaleY: 1 + interaction.value * 0.04 + pressure * 0.025 - edgeResponse.value * 0.015 },
    ] };
  });
  return <Animated.View testID="tab-indicator" pointerEvents="none" style={[s.indicator, { width: itemWidth }, motion]}>
    <TabBarIndicatorSurface />
  </Animated.View>;
});

/** One glass navbar for Expo Go and installed builds; gestures stay on the UI thread. */
export function FixedCapsuleTabBar({ state, navigation, insets, activeIndex = state.index, onSelectTab, indicatorMotion, interactionEnabled = true }: NativeTabBarProps) {
  const { copy } = usePreferences();
  const [width, measure] = useState(0);
  const previousWidth = useRef(0);
  const localPosition = useSharedValue(0);
  const localInteraction = useSharedValue(0);
  const localEdgeResponse = useSharedValue(0);
  const localEdgeDirection = useSharedValue(1);
  const localCompact = useSharedValue(0);
  const scrollController = useContext(NavbarScrollContext);
  const compact = scrollController?.compact ?? localCompact;
  const onBarTouch = scrollController?.onTouch;
  const position = indicatorMotion?.position ?? localPosition;
  const gestureCommand = indicatorMotion?.gestureCommand;
  const interaction = indicatorMotion?.interaction ?? localInteraction;
  const edgeResponse = indicatorMotion?.edgeResponse ?? localEdgeResponse;
  const edgeDirection = indicatorMotion?.edgeDirection ?? localEdgeDirection;
  const sharedMotion = Boolean(indicatorMotion);
  const origin = useSharedValue(0);
  const tracking = useSharedValue(false);
  const dragTarget = useSharedValue(0);
  const pickupOffset = useSharedValue(0);
  const edgeSide = useSharedValue(0);
  const impactOrigin = useSharedValue(0);
  const controlledIndex = useSharedValue(activeIndex);
  const count = state.routes.length;
  const itemWidth = width ? width / count : indicatorMotion?.itemWidth ?? 0;
  const limit = Math.max(0, (count - 1) * itemWidth);
  const barWidth = itemWidth * count + barInset * 2;

  useLayoutEffect(() => {
    if (!itemWidth) return;
    const resized = previousWidth.current !== width;
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
    })();
    // The provider owns a shared spring across stack scenes. A newly mounted
    // navbar joins it without resetting it or starting another animation.
    if (!sharedMotion) {
      const target = activeIndex * itemWidth;
      position.value = previousWidth.current === width ? withTabTravel(target) : target;
    }
    previousWidth.current = width;
  }, [activeIndex, itemWidth, width, sharedMotion, position, tracking, pickupOffset, controlledIndex, gestureCommand]);

  // Ease the initial grip offset away, then keep following with a little weight.
  // Retargeting this UI-thread spring carries motion through quick reversals.
  useAnimatedReaction(
    () => interactionEnabled && tracking.value ? dragTarget.value + pickupOffset.value : null,
    value => { if (value !== null) position.value = withSpring(value, tabCapsuleFollowSpring); },
  );

  const bounceAtEdge = (strength: number, side: number) => {
    'worklet';
    edgeDirection.value = side;
    edgeResponse.value = withSequence(
      withTiming(strength, tabCapsuleImpactTiming),
      withSpring(0, tabCapsuleReleaseSpring),
    );
  };

  // Only a freely travelling capsule can impact the glass. Under a held finger
  // the edge applies continuous resistance, without launching a recoil spring.
  useAnimatedReaction(
    () => interactionEnabled && itemWidth > 0 ? { position: position.value, tracking: tracking.value } : null,
    (current, previous) => {
      if (current === null) return;
      const value = current.position;
      if (current.tracking) {
        const side = value <= 3 ? -1 : value >= limit - 3 ? 1 : 0;
        if (side) {
          edgeSide.value = side;
          edgeDirection.value = side;
        } else if (value > 9 && value < limit - 9) edgeSide.value = 0;
        return;
      }
      if (previous === null) {
        edgeSide.value = value <= 3 ? -1 : value >= limit - 3 ? 1 : 0;
        return;
      }
      // Contact also happens when the spring arrives without overshooting.
      // Ignore departure from an end and latch contact through the recoil.
      const side = value <= 3 && value < previous.position ? -1
        : value >= limit - 3 && value > previous.position ? 1 : 0;
      if (side && side !== edgeSide.value) {
        edgeSide.value = side;
        bounceAtEdge(Math.min(1, Math.max(0.18, Math.abs(value - impactOrigin.value) / Math.max(itemWidth, limit))), side);
      } else if (value > 9 && value < limit - 9) edgeSide.value = 0;
    },
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
    if (!accepted || !animatedOnUI) position.value = withTabTravel((accepted ? index : activeIndex) * itemWidth);
  }, [compact, onBarTouch, itemWidth, position]);

  const pan = useMemo(() => Gesture.Pan().enabled(interactionEnabled && itemWidth > 0).maxPointers(1)
    .activeOffsetX([-4, 4]).failOffsetY([-8, 8])
    .onBegin(() => {
      compact.value = withSpring(0, tabCapsulePressSpring);
      if (onBarTouch) runOnJS(onBarTouch)();
      impactOrigin.value = position.value;
      interaction.value = withSpring(1, tabCapsulePressSpring);
      edgeResponse.value = withSpring(0, tabCapsuleReleaseSpring);
    })
    .onStart(event => {
      cancelAnimation(position);
      cancelAnimation(edgeResponse);
      edgeResponse.value = 0;
      // Read the displayed location when picking up an in-flight bounce.
      position.value = Math.min(limit + edgeTravel, Math.max(-edgeTravel, position.value));
      cancelAnimation(pickupOffset);
      const physicalStart = event.x - event.translationX;
      origin.value = physicalStart - barInset - itemWidth / 2;
      dragTarget.value = resistedPosition(origin.value + event.translationX, limit);
      pickupOffset.value = position.value - dragTarget.value;
      edgeSide.value = 0;
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
        position.value = withTabTravel(controlledIndex.value * itemWidth);
        return;
      }
      // A quick release commits the finger's target even while pickup is running.
      const index = Math.max(0, Math.min(count - 1, Math.round(dragTarget.value / itemWidth)));
      const request = gestureCommand?.value;
      const gestureId = request ? request.id + 1 : undefined;
      if (gestureCommand && request) gestureCommand.value = { ...request, id: gestureId!, index, pending: true };
      position.value = withTabTravel(index * itemWidth);
      runOnJS(select)(index, true, gestureId);
    })
    .onFinalize(() => {
      interaction.value = withSpring(0, tabCapsuleReleaseSpring);
      if (!tracking.value) return;
      tracking.value = false;
      cancelAnimation(pickupOffset);
      position.value = withTabTravel(controlledIndex.value * itemWidth);
    }), [interactionEnabled, itemWidth, limit, count, onBarTouch, select, position, compact, impactOrigin, interaction, edgeResponse, pickupOffset, tracking, origin, dragTarget, edgeSide, controlledIndex, gestureCommand]);
  // Each tab owns its tap recognizer. A whole-bar Tap treats overlapping
  // contacts on different tabs as one unfinished gesture on iOS, swallowing
  // rapid alternations before they ever reach the navigation queue.
  const taps = useMemo(() => Array.from({ length: count }, (_, index) =>
    Gesture.Tap().enabled(interactionEnabled && itemWidth > 0).maxDuration(10000)
    .requireExternalGestureToFail(pan)
    .onEnd((_event, success) => {
      if (!success) return;
      const target = index * itemWidth;
      const distanceInTabs = Math.abs(target - position.value) / itemWidth;
      const request = gestureCommand?.value;
      const gestureId = request ? request.id + 1 : undefined;
      if (gestureCommand && request) gestureCommand.value = { ...request, id: gestureId!, index, pending: true };
      position.value = withTabTravel(target, distanceInTabs);
      runOnJS(select)(index, true, gestureId);
    })), [interactionEnabled, itemWidth, count, select, position, gestureCommand, pan]);
  // Dragging still belongs to the whole bar. Every tap waits for that pan to
  // fail, so releasing a drag cannot also select its starting tab.
  // Every scene displays the same travelling position for native handoffs;
  // only the foreground scene's reactions write the shared edge response.
  const glassExtension = useDerivedValue(() => {
    const overflow = Math.max(0, -position.value, position.value - limit);
    const heldPressure = tracking.value ? Math.min(1, overflow / edgeTravel) * 3 : 0;
    const distance = edgeDirection.value < 0 ? position.value : limit - position.value;
    const contact = Math.max(0, 1 - Math.max(0, distance) / 12);
    const impact = edgeResponse.value * impactExtension * contact;
    return heldPressure > 0 ? Math.max(heldPressure, impact) : impact;
  });
  // Keep Fabric layout fixed throughout motion. Transform the glass toward
  // the contacted edge and compensate its content, leaving icons stationary.
  const barSize = { width: itemWidth > 0 ? barWidth : '100%' } as const;
  const barMotion = useAnimatedStyle(() => ({ transform: [
    { translateX: edgeDirection.value * glassExtension.value / 2 },
    { scaleX: barWidth > 0 ? 1 + glassExtension.value / barWidth : 1 },
    { scaleY: 1 - edgeResponse.value * 0.006 },
  ] }));
  const trackMotion = useAnimatedStyle(() => ({
    transform: [
      { translateX: barWidth > 0 ? -edgeDirection.value * glassExtension.value / (2 * (1 + glassExtension.value / barWidth)) : 0 },
      { scaleX: barWidth > 0 ? 1 / (1 + glassExtension.value / barWidth) : 1 },
      { scaleY: 1 / (1 - edgeResponse.value * 0.006) },
    ],
  }));
  const compactMotion = useAnimatedStyle(() => ({ transform: [
    { scale: 1 - compact.value * (1 - navbarCompactScale) },
  ] }));

  return <View collapsable={false} pointerEvents={interactionEnabled ? 'box-none' : 'none'} accessibilityElementsHidden={!interactionEnabled} style={[s.position, { bottom: Math.max(12, insets.bottom - 12) }]}>
    <GestureDetector gesture={pan}>
      <View testID="tab-hit-area" collapsable={false} style={s.hitArea} onLayout={event => {
        const nextWidth = Math.max(0, event.nativeEvent.layout.width - barInset * 2);
        if (!nextWidth) return;
        measure(nextWidth); indicatorMotion?.measure(nextWidth / state.routes.length);
      }}>
        <Animated.View testID="tab-compact-motion" style={compactMotion}>
          <Animated.View testID="tab-bar-motion" style={[barSize, barMotion]}>
            <TabBarSurface testID="tab-bar" style={s.bar}>
              <Animated.View testID="tab-track" collapsable={false} style={[s.track, { width: itemWidth > 0 ? itemWidth * count : '100%' }, trackMotion]}>
                {itemWidth > 0 && <FixedTabIndicator position={position} interaction={interaction} edgeResponse={edgeResponse}
                  edgeDirection={edgeDirection} extension={glassExtension} itemWidth={itemWidth} limit={limit} />}
                {state.routes.map((route, index) => <GestureDetector key={route.key} gesture={taps[index]!}>
                  <View collapsable={false} testID={`tab-${route.name}`} accessible
                  accessibilityRole="tab" accessibilityLabel={copy(labels[index] ?? 'nav.home')}
                  accessibilityState={{ selected: index === activeIndex }} style={s.tab}
                  onAccessibilityTap={() => select(index)}
                  accessibilityActions={[{ name: 'activate' }]}
                  onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') select(index); }}>
                  <TabBarIcon index={index} active={index === activeIndex} size={26} color="white" strokeWidth={2} />
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
