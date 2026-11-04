import React, { createContext, forwardRef, useContext, type PropsWithChildren } from 'react';
import { View, useWindowDimensions, type ViewInstance } from 'react-native';
import { InnerScreen, ScreenContext, type ScreenProps } from 'react-native-screens';

const NativeSceneScreenContext = createContext(InnerScreen);

// Bottom tabs use animation="none" and detachInactiveScreens={false}. The
// default disabled Screen hides inactive tabs with display:none, invalidating
// their layout. Keep these outer scenes attached and laid out instead. Inactive
// scenes are parked outside the viewport at a constant zIndex. Reordering a
// native subtree removes/reinserts its views and Expo reinstalls every glass
// effect on re-entry. Parking preserves those effects and the measured layout.
// Alpha must remain 1 (UIKit can drop glass beneath a transparent parent).
// Restore the original Screen so nested stacks and interactive back stay native.
const AttachedTabScene = forwardRef<ViewInstance, ScreenProps>(function AttachedTabScene(props, ref) {
  const NativeScreen = useContext(NativeSceneScreenContext);
  const viewport = useWindowDimensions();
  const { children, activityState, enabled, isNativeStack, style, pointerEvents, onLayout, testID } = props;
  const content = <ScreenContext.Provider value={NativeScreen}>{children}</ScreenContext.Provider>;
  // Only replace the disabled, non-animated outer tab screens.
  if (enabled !== false || isNativeStack || typeof activityState !== 'number') {
    return <NativeScreen {...props} ref={ref}>{content}</NativeScreen>;
  }
  const visible = activityState !== 0;
  return <View ref={ref} collapsable={false} testID={testID} onLayout={onLayout}
    style={[style, { zIndex: 0, transform: [{ translateX: visible ? 0 : viewport.width * 2 }] }]}
    pointerEvents={visible ? pointerEvents : 'none'}
    accessibilityElementsHidden={!visible}
    importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
    {content}
  </View>;
});

export function PersistentTabScenes({ children }: PropsWithChildren) {
  const NativeScreen = useContext(ScreenContext);
  return <NativeSceneScreenContext.Provider value={NativeScreen}>
    <ScreenContext.Provider value={AttachedTabScene}>{children}</ScreenContext.Provider>
  </NativeSceneScreenContext.Provider>;
}
