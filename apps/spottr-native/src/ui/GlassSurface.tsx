import React, { forwardRef } from 'react';
import { View, type ViewInstance } from 'react-native';
import type { GlassSurfaceProps } from './glassSurfaceTypes';

export const GlassSurface = forwardRef<ViewInstance, GlassSurfaceProps>(function GlassSurface({ tintColor: _tintColor, interactive: _interactive, ...props }, ref) {
  return <View {...props} ref={ref} />;
});
