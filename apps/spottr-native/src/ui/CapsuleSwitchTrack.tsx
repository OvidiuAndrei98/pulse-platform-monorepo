import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, runOnUI, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { tabCapsuleFollowSpring, tabCapsuleImpactTiming, tabCapsulePressSpring, tabCapsuleReleaseSpring, tabCapsuleSpring } from '../navigation/tabCapsuleSpring';
import { capsuleSwitchDrop, capsuleSwitchGeometry } from './capsuleSwitchGeometry';
import { colors } from './theme';

export type CapsuleSwitchOption<T extends string> = { value: T; label: string; content: React.ReactNode; testID?: string };

/** Shared indicator and press physics for the discovery and Quick Connect switches. */
export function CapsuleSwitchTrack<T extends string>({ value, onChange, options, height, width, disabled = false, role = 'button', indicatorTestID }: {
  value: T; onChange: (value: T) => void; options: readonly CapsuleSwitchOption<T>[];
  height: number; width?: number; disabled?: boolean; role?: 'button' | 'tab'; indicatorTestID?: string;
}) {
  const index = Math.max(0, options.findIndex(option => option.value === value)), count = Math.max(1, options.length);
  const position = useSharedValue(index), target = useSharedValue(index);
  const pressure = useSharedValue(0), measuredWidth = useSharedValue(width ?? 0);
  const dragging = useSharedValue(false), origin = useSharedValue(index), impact = useSharedValue(0), edge = useSharedValue(0);
  const suppressClickUntil = useSharedValue(0), reduced = useReducedMotion();
  const command = useSharedValue({ id: 0, index, pending: false });
  const [acknowledged, acknowledge] = useState(0);
  const latest = useRef({ options, onChange, disabled }), mounted = useRef(true), committed = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useLayoutEffect(() => { latest.current = { options, onChange, disabled }; }, [options, onChange, disabled]);
  const commit = useCallback((next: number, id: number) => {
    const current = latest.current, option = current.options[next];
    if (!mounted.current || current.disabled || !option || id <= committed.current) return;
    committed.current = id;
    acknowledge(id);
    current.onChange(option.value);
  }, []);
  const selectOnUI = useCallback((next: number, velocity?: number) => {
    'worklet';
    const id = command.value.id + 1;
    command.value = { id, index: next, pending: true };
    target.value = next;
    position.value = withSpring(next, velocity === undefined ? tabCapsuleSpring : { ...tabCapsuleSpring, velocity });
    // React may build a map or mount a camera. It must not start or restart
    // the indicator's spring: touch feedback already runs on the UI thread.
    runOnJS(commit)(next, id);
  }, [command, target, position, commit]);
  useLayoutEffect(() => {
    runOnUI((next: number, ack: number, blocked: boolean) => {
      const request = command.value;
      if (blocked) {
        command.value = { ...request, pending: false };
        dragging.value = false;
        pressure.value = 0;
        impact.value = 0;
      }
      else if (dragging.value) return;
      else if (request.pending) {
        if (request.id === ack && request.index === next) command.value = { ...request, pending: false };
        return; // An older React render cannot pull a newer touch backwards.
      }
      if (target.value === next) return;
      target.value = next;
      position.value = withSpring(next, tabCapsuleSpring);
    })(index, acknowledged, disabled);
  }, [index, acknowledged, disabled, command, position, target, dragging, pressure, impact]);
  useAnimatedReaction(() => ({ x: position.value, held: dragging.value }), (current, previous) => {
    const last = count - 1, x = current.x;
    if (reduced || current.held || last <= 0) { edge.value = 0; return; }
    const side = previous && x < previous.x && x <= .015 ? -1 : previous && x > previous.x && x >= last - .015 ? 1 : 0;
    if (side && side !== edge.value) {
      edge.value = side;
      impact.value = withSequence(withTiming(1, tabCapsuleImpactTiming), withSpring(0, tabCapsuleReleaseSpring));
    } else if (x > .06 && x < last - .06) edge.value = 0;
  }, [count, reduced]);
  const choose = (next: number) => {
    if (!disabled && options[next]) runOnUI(selectOnUI)(next);
  };
  const native = Platform.OS !== 'web';
  const pan = useMemo(() => Gesture.Pan().enabled(!disabled && count > 1).maxPointers(1)
    .activeOffsetX([-5, 5]).failOffsetY([-9, 9])
    .onBegin(() => {
      suppressClickUntil.value = 0;
      pressure.value = withSpring(1, tabCapsulePressSpring);
    })
    .onStart(() => {
      if (measuredWidth.value <= 0) return;
      cancelAnimation(position);
      cancelAnimation(impact);
      impact.value = 0;
      origin.value = Math.max(0, Math.min(count - 1, position.value));
      dragging.value = true;
    })
    .onUpdate(event => {
      if (!dragging.value || measuredWidth.value <= 0) return;
      const next = origin.value + event.translationX / (measuredWidth.value / count);
      position.value = withSpring(Math.max(-.08, Math.min(count - 1 + .08, next)), tabCapsuleFollowSpring);
    })
    .onEnd((event, success) => {
      if (!dragging.value || measuredWidth.value <= 0) return;
      dragging.value = false;
      suppressClickUntil.value = Date.now() + 250;
      const unit = measuredWidth.value / count;
      if (success) selectOnUI(capsuleSwitchDrop(origin.value + event.translationX / unit, event.velocityX / unit, count), Math.max(-4, Math.min(4, event.velocityX / unit)));
      else position.value = withSpring(target.value, tabCapsuleSpring);
    })
    .onFinalize(() => {
      if (dragging.value) { dragging.value = false; position.value = withSpring(target.value, tabCapsuleSpring); }
      pressure.value = withSpring(0, tabCapsuleReleaseSpring);
    }), [disabled, count, suppressClickUntil, pressure, measuredWidth, position, impact, origin, dragging, target, selectOnUI]);
  // Separate taps never hold the entire control in a pending recognizer state.
  const taps = useMemo(() => Array.from({ length: count }, (_, next) => Gesture.Tap()
    .enabled(native && !disabled).maxDuration(10000).requireExternalGestureToFail(pan)
    .onEnd((_event, success) => { if (success) selectOnUI(next); })), [count, native, disabled, pan, selectOnUI]);
  const touch = () => { pressure.value = withSpring(1, tabCapsulePressSpring); };
  const release = () => { pressure.value = withSpring(0, tabCapsuleReleaseSpring); };
  const capsule = useAnimatedStyle(() => {
    const geometry = capsuleSwitchGeometry(position.value, target.value, pressure.value, impact.value, measuredWidth.value / count, count, reduced);
    return { transform: [
      { translateX: geometry.x },
      { scaleX: geometry.scaleX },
      { scaleY: geometry.scaleY },
    ] };
  });
  const track = <View collapsable={false} style={[s.track, { height, width: width ?? '100%' }]}
    accessibilityRole={role === 'tab' ? 'tablist' : undefined}
    onLayout={event => { measuredWidth.value = event.nativeEvent.layout.width; }}>
    {/* Static layout dimensions stay out of the animation mapper. Sending width
        alongside transforms forces Fabric through layout commits on every frame. */}
    <Animated.View pointerEvents="none" testID={indicatorTestID} style={[s.capsule, { width: `${100 / count}%`, borderRadius: height / 2 }, capsule]}/>
    {options.map((option, next) => native ? <GestureDetector key={option.value} gesture={taps[next]!}><View collapsable={false} testID={option.testID} accessible
      accessibilityRole={role} accessibilityLabel={option.label}
      accessibilityState={{ selected: option.value === value, disabled }}
      onAccessibilityTap={() => choose(next)} accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') choose(next); }}
      style={[s.option, { height, borderRadius: height / 2 }]}>{option.content}</View></GestureDetector> : <Pressable key={option.value} testID={option.testID}
      accessibilityRole={role} accessibilityLabel={option.label}
      accessibilityState={{ selected: option.value === value, disabled }}
      aria-pressed={role === 'button' ? option.value === value : undefined}
      aria-selected={role === 'tab' ? option.value === value : undefined}
      disabled={disabled} tabIndex={disabled ? -1 : 0}
      onPress={() => { if (Date.now() >= suppressClickUntil.value) choose(next); }} onPressIn={touch} onPressOut={release} onBlur={release}
      hitSlop={{ top: 4, bottom: 4 }} style={[s.option, { height, borderRadius: height / 2 }]}>
      {option.content}
    </Pressable>)}
  </View>;
  return <GestureDetector gesture={pan} touchAction="pan-y">{track}</GestureDetector>;
}
const s = StyleSheet.create({
  track: { position: 'relative', flexDirection: 'row' },
  capsule: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent },
  option: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
});
