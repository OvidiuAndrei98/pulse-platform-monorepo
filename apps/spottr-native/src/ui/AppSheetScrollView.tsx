import React, { forwardRef } from 'react';
import { Platform } from 'react-native';
import { BottomSheetScrollView, type BottomSheetScrollViewMethods } from '@gorhom/bottom-sheet';
import { useFocusEffect } from '@react-navigation/native';
import { useSheetScrollEvents } from './useSheetScrollEvents';

/** Scroll to the edge, then let the sheet own the downward movement. */
export const AppSheetScrollView = forwardRef<BottomSheetScrollViewMethods, React.ComponentProps<typeof BottomSheetScrollView>>((props, ref) => (
  <BottomSheetScrollView
    focusHook={useFocusEffect}
    scrollEventsHandlersHook={useSheetScrollEvents}
    {...props}
    ref={ref}
    // UIKit's independent rubber-band exposes a gap beneath the fixed grabber
    // when a fling reaches the top after Pan has ended. Gorhom owns sheet drag
    // and snap-back; the inner scroll view must stop at its content bounds.
    {...(Platform.OS === 'ios' ? { bounces: false } : {})}
    {...(Platform.OS === 'web' ? { dataSet: { spottrSheetScroll: 'true' } } : {})}
  />
));
AppSheetScrollView.displayName = 'AppSheetScrollView';
