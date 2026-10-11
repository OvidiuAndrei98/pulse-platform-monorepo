import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from './theme';
import { Image } from 'expo-image';

export function Wordmark() { return <Image accessibilityLabel="SPOTTR" source={require('../../assets/spottr-logo-desktop.svg')} style={{ width: 120, height: 20 }} contentFit="contain" draggable={false} />; }

export function Logo({ size = 34 }: { size?: number }) {
  return <Svg width={size} height={size * 318 / 333} viewBox="0 0 333 318" accessibilityLabel="Spottr">
    <Circle cx="168" cy="159" r="39" fill={colors.accent} />
    <Path d="M166.772 82.4887C109.754 83.6523 71.991 144.844 101.989 197.714C102.882 199.29 101.374 201.21 99.6317 200.717C-27.9636 164.551 29.1989 0 147.242 0H328.116C329.898 0 330.79 2.15428 329.53 3.41421L251.651 81.2932C213.609 81.2932 204.807 81.7125 166.772 82.4887Z" fill={colors.accent} />
    <Path d="M169.357 235.51C226.375 234.347 264.138 173.155 234.14 120.285C233.247 118.709 234.755 116.789 236.497 117.282C364.093 153.448 306.93 317.999 188.887 317.999L4.82843 317.999C3.04663 317.999 2.1543 315.845 3.41422 314.585L80.7074 237.292C81.0825 236.917 81.6047 236.706 82.1351 236.706C119.515 236.7 131.604 236.281 169.357 235.51Z" fill={colors.accent} />
  </Svg>;
}
