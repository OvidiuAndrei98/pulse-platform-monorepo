import React, { createContext, forwardRef, useContext, type PropsWithChildren } from 'react';
import { View, type ViewInstance } from 'react-native';
import { InnerScreen, ScreenContext, type ScreenProps } from 'react-native-screens';

const NativeSceneScreenContext = createContext(InnerScreen);

// Bottom tabs use animation="none" and detachInactiveScreens={false}. The
// default disabled Screen hides inactive tabs with display:none, invalidating
// their layout. Keep these outer scenes attached and laid out instead. Inactive
// scenes sit behind the focused scene's opaque background; alpha must stay at 1
// because UIKit can permanently drop a glass effect beneath a transparent parent.
// Restore the original Screen so nested native stacks stay native.
const AttachedTabScene = forwardRef<ViewInstance, ScreenProps>(function AttachedTabScene(props, ref) {
  const NativeScreen = useContext(NativeSceneScreenContext);
  const { children, activityState, enabled, isNativeStack, style, pointerEvents, onLayout, testID } = props;
  const content = <ScreenContext.Provider value={NativeScreen}>{children}</ScreenContext.Provider>;
  // Only replace the disabled, non-animated outer tab screens.
  if (enabled !== false || isNativeStack || typeof activityState !== 'number') {
    return <NativeScreen {...props} ref={ref}>{content}</NativeScreen>;
  }
  const visible = activityState !== 0;
  return <View ref={ref} collapsable={false} testID={testID} onLayout={onLayout}
    style={[style, { zIndex: visible ? 0 : -1 }]}
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
