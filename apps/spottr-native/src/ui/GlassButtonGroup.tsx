import React from 'react';
import { View, type ViewProps } from 'react-native';
import { glassButtonGroupStyle } from './glassButtonStyles';

export function GlassButtonGroup({ style, ...props }: ViewProps) {
  return <View {...props} pointerEvents="box-none" accessible={false}
    style={[glassButtonGroupStyle, style]} />;
}
