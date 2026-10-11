import React, { forwardRef } from 'react';
import { Platform } from 'react-native';
import { BottomSheetScrollView, type BottomSheetScrollViewMethods } from '@gorhom/bottom-sheet';

/** Keep vertical touch ownership on web so scrolling can hand off to dragging. */
export const AppSheetScrollView = forwardRef<BottomSheetScrollViewMethods, React.ComponentProps<typeof BottomSheetScrollView>>((props, ref) => (
  <BottomSheetScrollView {...props} ref={ref} {...(Platform.OS === 'web' ? { dataSet: { spottrSheetScroll: 'true' } } : {})} />
));
AppSheetScrollView.displayName = 'AppSheetScrollView';
