import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, type GestureResponderEvent, type KeyDownEvent, type KeyUpEvent, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { usePreferences } from '../usePreferences';

/** A physical contact must last 1.4s; release, leaving, blur and disable cancel. */
export function HoldForHelp({ disabled, compact, onComplete }: { disabled: boolean; compact?: boolean; onComplete: () => void }) {
  const { copy } = usePreferences(), [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), fill = useRef(new Animated.Value(0)).current;
  const completed = useRef(false), keyHeld = useRef(false), callback = useRef(onComplete);
  callback.current = onComplete;
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; fill.stopAnimation(); fill.setValue(0); setHolding(false);
  }, [fill]);
  const start = () => {
    if (disabled || timer.current) return;
    completed.current = false; setHolding(true);
    Animated.timing(fill, { toValue: 1, duration: 1400, useNativeDriver: false }).start();
    timer.current = setTimeout(() => { timer.current = null; completed.current = true; stop(); callback.current(); }, 1400);
  };
  useEffect(() => { if (disabled) stop(); }, [disabled, stop]);
  useEffect(() => stop, [stop]);
  const virtualPress = (event: GestureResponderEvent) => {
    if (disabled) return;
    const native = (event.nativeEvent ?? event) as unknown as { detail?: number; identifier?: number; type?: string };
    if (native.type === 'keyup' || native.type === 'keydown') return;
    if (completed.current) { completed.current = false; return; }
    if (keyHeld.current) return;
    if (Platform.OS === 'web' ? native.detail === 0 : typeof native.identifier !== 'number') { stop(); callback.current(); }
  };
  const webKeys = Platform.OS === 'web' ? {
    delayPressIn: 0,
    onKeyDown: (event: KeyDownEvent) => {
      if (!['Enter', ' '].includes(event.nativeEvent.key)) return;
      event.preventDefault(); keyHeld.current = true; if (!event.nativeEvent.repeat) start();
    },
    onKeyUp: (event: KeyUpEvent) => {
      if (!['Enter', ' '].includes(event.nativeEvent.key)) return;
      event.preventDefault(); stop(); keyHeld.current = false;
    },
    onPointerLeave: stop,
  } : {};
  return <Pressable {...webKeys} testID="safety-hold-help" accessibilityRole="button" accessibilityLabel={copy(holding ? 'safetyGroup.keepHolding' : 'safetyGroup.holdForHelp')}
    accessibilityState={{ disabled }} disabled={disabled} onPressIn={start} onPressOut={stop} onPress={virtualPress}
    onAccessibilityTap={() => { if (!disabled) { stop(); callback.current(); } }} onBlur={() => { keyHeld.current = false; stop(); }}
    style={[styles.button, compact && { minHeight: 36, paddingVertical: 4 }, disabled && { opacity: 0.4 }]}>
    {holding && <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: '#ef444440', width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />}
    <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ShieldAlert size={20} color="#fca5a5" /><Text style={styles.label}>{copy(holding ? 'safetyGroup.keepHolding' : 'safetyGroup.holdForHelp')}</Text></View>
  </Pressable>;
}
const styles = StyleSheet.create({ button: { minHeight: 44, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 99, borderWidth: 1, borderColor: '#f8717180', backgroundColor: '#ef44441a', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, label: { color: '#fca5a5', fontSize: 14, fontWeight: '600' } });
