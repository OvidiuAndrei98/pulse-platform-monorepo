import React, { useMemo } from 'react';
import type { ViewProps } from 'react-native';
import NativeMaskedView from '@react-native-masked-view/masked-view';
import Svg, { Path } from 'react-native-svg';
import { continuousCornerPath } from '@packages/app-core/navigation/continuousCornerPath';
import type { NavBarMaskProps } from './NavBarMask';

const MaskedView = NativeMaskedView as unknown as React.ComponentType<ViewProps & {
  maskElement: React.ReactElement;
  androidRenderingMode?: 'hardware';
}>;

export function NavBarMask({ width, height, children }: NavBarMaskProps) {
  const w = width || 350;
  const d = useMemo(() => continuousCornerPath(w, height, height / 2), [w, height]);

  return <MaskedView style={{ width: '100%', height }} androidRenderingMode="hardware"
    maskElement={<Svg width="100%" height="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <Path d={d} fill="black" />
    </Svg>}>
    {children}
  </MaskedView>;
}
