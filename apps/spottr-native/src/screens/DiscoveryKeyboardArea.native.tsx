import React from 'react';
import type { ViewProps } from 'react-native';
import { KeyboardGestureArea } from 'react-native-keyboard-controller';

export function DiscoveryKeyboardArea(props: ViewProps) {
  // Linking the input also installs the invisible iOS accessory needed by
  // UIKit's interactive dismissal, without adding a visible keyboard toolbar.
  return <KeyboardGestureArea {...props} textInputNativeID="discovery-search" offset={0}
    interpolator="ios" showOnSwipeUp={false} />;
}
