import type { IOSNativeProps } from '@react-native-community/datetimepicker';

export type NativePickerMode = 'date' | 'time' | 'datetime';
export type OpenNativePicker = (value: Date, mode: NativePickerMode, onConfirm: (date: Date) => void, onUnavailable: () => void) => boolean;

// Metro resolves the native adapter only on phones. Keep browser imports free
// of code-generated components and Android TurboModule getEnforcing calls.
export function NativeDateTimePicker(_props: IOSNativeProps) { return null; }
export function useNativeDateTimePicker(_disabled = false): { available: boolean; openAndroid: OpenNativePicker } {
  return { available: false, openAndroid: () => false };
}
