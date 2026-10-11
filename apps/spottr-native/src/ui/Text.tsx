import React from 'react';
import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';

// Inter is the same typeface used by pulse-app/src/app/layout.tsx.
export function Text({ style, ...props }: TextProps) {
  const weight = StyleSheet.flatten(style)?.fontWeight;
  const number = weight === 'bold' ? 700 : Number(weight) || 400;
  const family = number >= 900 ? 'Inter_900Black' : number >= 800 ? 'Inter_800ExtraBold' : number >= 700 ? 'Inter_700Bold' : number >= 600 ? 'Inter_600SemiBold' : number >= 500 ? 'Inter_500Medium' : 'Inter_400Regular';
  return <NativeText {...props} style={[style, { fontFamily: family, fontWeight: 'normal' }]} />;
}
