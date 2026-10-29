import React from 'react';
import Svg, { Path } from 'react-native-svg';
import type { TabBarIconProps } from './TabBarIconFallback';

// Same proportions as the UIKit artwork for older builds without the module.
const paths = [
  'M3 11 13 3 23 11V23H17V15H9V23H3Z',
  'M3 6 10 3 17 6 23 3V20L17 23 10 20 3 23ZM10 3V20M17 6V23',
  'M13 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M23 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0M2 23C2 13 16 13 16 23M19 16C23 16 24 19 24 23',
  'M18 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0M3 23C3 12 23 12 23 23',
];
export function TabBarIcon({ index, active, size }: TabBarIconProps) {
  return <Svg width={Math.max(size, 26)} height={Math.max(size, 26)} viewBox="0 0 26 26"
    fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
    <Path d={paths[index] ?? paths[0]} fill={active && index !== 1 ? 'white' : 'none'} />
  </Svg>;
}
