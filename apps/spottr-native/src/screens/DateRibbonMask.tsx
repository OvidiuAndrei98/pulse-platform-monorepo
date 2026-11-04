import React from 'react';
import { View, type ViewStyle } from 'react-native';

const edgeMask = { maskImage: 'linear-gradient(to right,transparent,#000 8%,#000 92%,transparent)' } as unknown as ViewStyle;
export function DateRibbonMask({ children }: React.PropsWithChildren) {
  return <View style={[{ flex: 1 }, edgeMask]}>{children}</View>;
}
