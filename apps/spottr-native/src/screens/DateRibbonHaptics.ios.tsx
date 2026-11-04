import React from 'react';
import { type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { useIsFocused } from '@react-navigation/native';

const nativeModule = requireOptionalNativeModule<{ scrollFeedbackVersion?: number }>('SpottrDateHaptics');
export const hasNativeDateRibbonHaptics = nativeModule?.scrollFeedbackVersion === 1;
type Props = { enabled: boolean; stepWidth: number };
const NativeFeedback = hasNativeDateRibbonHaptics ? requireNativeView<Props & ViewProps>('SpottrDateHaptics') : null;

export function DateRibbonHaptics({ enabled, stepWidth }: Props) {
  const focused = useIsFocused();
  return NativeFeedback ? <NativeFeedback enabled={enabled && focused} stepWidth={stepWidth} pointerEvents="none"
    accessible={false} style={{ position: 'absolute', width: 1, height: 1, left: 0, top: 0 }} /> : null;
}
