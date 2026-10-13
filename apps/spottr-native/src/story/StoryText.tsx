import React from 'react';
import { Text } from 'react-native-svg';

export type StoryTextProps = {
  x: number; y: number; size: number; color?: string; weight?: 'medium' | 'bold' | 'black';
  spacing?: number; anchor?: 'start' | 'middle' | 'end'; width?: number; children: string;
};

export function StoryText({ x, y, size, color = '#ffffff', weight = 'medium', spacing = 0, anchor = 'start', width, children }: StoryTextProps) {
  return <Text x={x} y={y} fontSize={size} fill={color} letterSpacing={spacing} textAnchor={anchor}
    textLength={width} lengthAdjust={width ? 'spacingAndGlyphs' : undefined}
    fontFamily={weight === 'black' ? 'Inter_900Black' : weight === 'bold' ? 'Inter_700Bold' : 'Inter_500Medium'}>{children}</Text>;
}
