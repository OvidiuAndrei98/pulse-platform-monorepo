import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, runOnUI, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { tabCapsulePressSpring, tabCapsuleReleaseSpring, tabCapsuleSpring } from '../navigation/tabCapsuleSpring';
import { colors } from './theme';

type Option<T extends string> = { value: T; label: string; content: React.ReactNode; testID?: string };

/** Shared indicator and press physics for the discovery and Quick Connect switches. */
export function CapsuleSwitchTrack<T extends string>({ value, onChange, options, height, width, disabled = false, role = 'button', indicatorTestID }: {
  value: T; onChange: (value: T) => void; options: readonly Option<T>[];
  height: number; width?: number; disabled?: boolean; role?: 'button' | 'tab'; indicatorTestID?: string;
}) {
  const index = Math.max(0, options.findIndex(option => option.value === value)), count = Math.max(1, options.length);
  const position = useSharedValue(index), target = useSharedValue(index);
  const pressure = useSharedValue(0), measuredWidth = useSharedValue(width ?? 0);
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
  const selectOnUI = useCallback((next: number) => {
    'worklet';
    const id = command.value.id + 1;
    command.value = { id, index: next, pending: true };
    target.value = next;
    position.value = withSpring(next, tabCapsuleSpring);
    // React may build a map or mount a camera. It must not start or restart
    // the indicator's spring: touch feedback already runs on the UI thread.
    runOnJS(commit)(next, id);
  }, [command, target, position, commit]);
  useLayoutEffect(() => {
    runOnUI((next: number, ack: number, blocked: boolean) => {
      const request = command.value;
      if (blocked) command.value = { ...request, pending: false };
      else if (request.pending) {
        if (request.id === ack && request.index === next) command.value = { ...request, pending: false };
        return; // An older React render cannot pull a newer touch backwards.
      }
      if (target.value === next) return;
      target.value = next;
      position.value = withSpring(next, tabCapsuleSpring);
    })(index, acknowledged, disabled);
  }, [index, acknowledged, disabled, command, position, target]);
  const choose = (next: number) => {
    if (!disabled && options[next]) runOnUI(selectOnUI)(next);
  };
  const native = Platform.OS !== 'web';
  const tap = useMemo(() => Gesture.Tap().enabled(native && !disabled).maxDuration(10000)
    .onBegin(() => { pressure.value = withSpring(1, tabCapsulePressSpring); })
    .onEnd((event, success) => {
      if (!success || measuredWidth.value <= 0) return;
      const next = Math.max(0, Math.min(count - 1, Math.floor(event.x / (measuredWidth.value / count))));
      selectOnUI(next);
    })
    .onFinalize(() => { pressure.value = withSpring(0, tabCapsuleReleaseSpring); }),
  [native, disabled, pressure, measuredWidth, count, selectOnUI]);
  const touch = () => { pressure.value = withSpring(1, tabCapsulePressSpring); };
  const release = () => { pressure.value = withSpring(0, tabCapsuleReleaseSpring); };
  const capsule = useAnimatedStyle(() => {
    const itemWidth = measuredWidth.value / count, travel = Math.min(1, Math.abs(target.value - position.value));
    return { transform: [
      { translateX: position.value * itemWidth },
      { scaleX: 1 + pressure.value * .04 + travel * .04 },
      { scaleY: 1 + pressure.value * .025 - travel * .015 },
    ] };
  });
  const track = <View collapsable={false} style={[s.track, { height, width: width ?? '100%' }]}
    accessibilityRole={role === 'tab' ? 'tablist' : undefined}
    onLayout={event => { measuredWidth.value = event.nativeEvent.layout.width; }}>
    {/* Static layout dimensions stay out of the animation mapper. Sending width
        alongside transforms forces Fabric through layout commits on every frame. */}
    <Animated.View pointerEvents="none" testID={indicatorTestID} style={[s.capsule, { width: `${100 / count}%`, borderRadius: height / 2 }, capsule]}/>
    {options.map((option, next) => native ? <View key={option.value} testID={option.testID} accessible
      accessibilityRole={role} accessibilityLabel={option.label}
      accessibilityState={{ selected: option.value === value, disabled }}
      onAccessibilityTap={() => choose(next)} accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') choose(next); }}
      style={[s.option, { height, borderRadius: height / 2 }]}>{option.content}</View> : <Pressable key={option.value} testID={option.testID}
      accessibilityRole={role} accessibilityLabel={option.label}
      accessibilityState={{ selected: option.value === value, disabled }}
      aria-pressed={role === 'button' ? option.value === value : undefined}
      aria-selected={role === 'tab' ? option.value === value : undefined}
      disabled={disabled} tabIndex={disabled ? -1 : 0}
      onPress={() => choose(next)} onPressIn={touch} onPressOut={release} onBlur={release}
      hitSlop={{ top: 4, bottom: 4 }} style={[s.option, { height, borderRadius: height / 2 }]}>
      {option.content}
    </Pressable>)}
  </View>;
  return native ? <GestureDetector gesture={tap}>{track}</GestureDetector> : track;
}
const s = StyleSheet.create({
  track: { position: 'relative', flexDirection: 'row' },
  capsule: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accent },
  option: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
});
