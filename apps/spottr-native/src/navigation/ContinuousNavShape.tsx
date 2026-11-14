import React, { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Svg, { ClipPath, Defs, Path } from 'react-native-svg';
import { continuousCornerPath } from '@packages/app-core/navigation/continuousCornerPath';
import { colors } from '../ui/theme';

type Props = { width: number; height: number; clipId?: string };
// react-native-svg forwards this browser SVG attribute, but its native props omit it.
const WebClipPath = ClipPath as React.ComponentType<React.ComponentProps<typeof ClipPath> & {
  clipPathUnits?: 'objectBoundingBox';
}>;

export const ContinuousNavShape = React.memo(function ContinuousNavShape({ width, height, clipId }: Props) {
  const w = width || 350;
  const d = useMemo(() => continuousCornerPath(w, height, height / 2), [w, height]);
  const edge = useMemo(() => continuousCornerPath(w - 1, height - 1, (height - 1) / 2), [w, height]);

  return <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none"
    pointerEvents="none" aria-hidden={true} style={StyleSheet.absoluteFill}>
    {clipId && Platform.OS === 'web' && <Defs>
      <WebClipPath id={clipId} clipPathUnits="objectBoundingBox">
        <Path d={d} transform={`scale(${1 / w} ${1 / height})`} />
      </WebClipPath>
    </Defs>}
    {clipId
      ? <Path d={edge} transform="translate(0.5 0.5)" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      : <Path d={d} fill={`${colors.accent}73`} />}
  </Svg>;
});
