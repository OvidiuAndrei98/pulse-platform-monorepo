import React from 'react';
import type { ViewProps } from 'react-native';
import NativeMaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';

const MaskedView = NativeMaskedView as unknown as React.ComponentType<ViewProps & { maskElement: React.ReactElement }>;
export function DateRibbonMask({ children }: React.PropsWithChildren) {
  return <MaskedView style={{ flex: 1 }} maskElement={<LinearGradient colors={['transparent', '#000', '#000', 'transparent']}
    locations={[0, 0.08, 0.92, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: '100%', height: 54 }} />}>
    {children}
  </MaskedView>;
}
