import React, { useCallback, useEffect, useRef } from 'react';
import { Platform, TurboModuleRegistry, UIManager } from 'react-native';
import type { IOSNativeProps } from '@react-native-community/datetimepicker';
import type { OpenNativePicker } from './NativeDateTimePicker';
import { withPickerDate, withPickerTime } from './datePickerParts';
import { colors } from '../ui/theme';

function availableInBinary() {
  try {
    if (Platform.OS === 'ios') return UIManager.hasViewManagerConfig('RNDateTimePicker');
    if (Platform.OS !== 'android') return false;
    // The package imports both Android designs even when using default dialogs.
    return ['RNCDatePicker', 'RNCTimePicker', 'RNCMaterialDatePicker', 'RNCMaterialTimePicker']
      .every(name => TurboModuleRegistry.get(name) !== null);
  } catch { return false; }
}
// Older installed builds retain the working custom picker until rebuilt.
const picker: typeof import('@react-native-community/datetimepicker') | null = availableInBinary()
  ? require('@react-native-community/datetimepicker') : null;

export function NativeDateTimePicker(props: IOSNativeProps) {
  const Picker = picker?.default;
  return Picker ? <Picker {...props}/> : null;
}

let androidSession: { token: symbol; cancel: () => void } | null = null;

export function useNativeDateTimePicker(disabled = false) {
  const alive = useRef(true), disabledRef = useRef(disabled), owned = useRef<symbol | null>(null);
  disabledRef.current = disabled;
  const cancel = useCallback(() => {
    if (!owned.current || androidSession?.token !== owned.current) return;
    owned.current = null; androidSession = null;
    for (const mode of ['date', 'time'] as const) void picker?.DateTimePickerAndroid.dismiss(mode).catch(() => {});
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; cancel(); }; }, [cancel]);
  useEffect(() => { if (disabled) cancel(); }, [disabled, cancel]);

  const openAndroid = useCallback<OpenNativePicker>((value, mode, onConfirm, onUnavailable) => {
    if (!picker || Platform.OS !== 'android' || disabledRef.current || !alive.current || !Number.isFinite(value.getTime())) return false;
    androidSession?.cancel();
    const token = Symbol('date-picker'); owned.current = token; androidSession = { token, cancel };
    const current = () => alive.current && !disabledRef.current && owned.current === token && androidSession?.token === token;
    const release = () => { owned.current = null; androidSession = null; };
    const dismiss = () => { if (current()) release(); };
    const fail = () => { if (current()) { release(); onUnavailable(); } };
    const finish = (date: Date) => { if (current()) { release(); onConfirm(date); } };
    const show = (part: 'date' | 'time', base: Date, complete: (date: Date) => void) => {
      try {
        picker.DateTimePickerAndroid.open({
          value: base, mode: part, display: 'default', is24Hour: true,
          positiveButton: { textColor: colors.accent }, negativeButton: { textColor: colors.muted },
          onValueChange: (_event, date) => {
            if (!current() || !Number.isFinite(date.getTime())) return;
            complete(part === 'date' ? withPickerDate(base, date) : withPickerTime(base, date));
          },
          onDismiss: dismiss, onError: fail,
        });
      } catch { fail(); }
    };
    if (mode === 'datetime') show('date', value, date => show('time', date, finish));
    else show(mode, value, finish);
    return true;
  }, [cancel]);
  return { available: picker !== null, openAndroid };
}
