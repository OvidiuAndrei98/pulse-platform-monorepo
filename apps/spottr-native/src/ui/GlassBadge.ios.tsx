import React from 'react';
import { StyleSheet, View, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { GlassSurface, supportsLiquidGlass } from './GlassSurface';
import { Text } from './Text';

const placementKeys = ['position', 'top', 'right', 'bottom', 'left', 'start', 'end', 'alignSelf', 'maxWidth',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd', 'zIndex', 'transform', 'opacity'] as const;

/** A passive label: its existing Text still determines sizing and typography.
 * Glass is a background sibling, so it never adds a button target or padding.
 */
export function GlassBadge({ style, testID, ...props }: TextProps) {
  if (!supportsLiquidGlass) return <Text {...props} testID={testID} style={style} />;
  const text: TextStyle = { ...StyleSheet.flatten(style) };
  const placement: ViewStyle = {};
  for (const key of placementKeys) {
    if (text[key] !== undefined) Object.assign(placement, { [key]: text[key] });
    delete text[key];
  }
  return <View testID={testID ? `${testID}-container` : undefined} pointerEvents="none" style={placement}>
    <GlassSurface testID={testID ? `${testID}-glass` : undefined} pointerEvents="none" interactive={false}
      accessible={false} style={[StyleSheet.absoluteFill, { borderRadius: text.borderRadius ?? 99 }]} />
    <Text {...props} testID={testID} style={[text, s.label]} />
  </View>;
}

const s = StyleSheet.create({ label: { backgroundColor: 'transparent', borderColor: 'transparent' } });
