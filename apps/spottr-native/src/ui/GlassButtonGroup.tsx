import React from 'react';
import { View, type ViewProps } from 'react-native';
import { glassButtonGroupStyle } from './glassButtonStyles';

export function GlassButtonGroup({ style, spacing: _spacing, ...props }: ViewProps & { spacing?: number }) {
  return <View {...props} pointerEvents="box-none" accessible={false}
    style={[glassButtonGroupStyle, style]} />;
}
