import type { ScrollViewInstance } from 'react-native';
import React, { forwardRef, useCallback } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView, KeyboardProvider, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
export { KeyboardStickyView as KeyboardFooter } from 'react-native-keyboard-controller';

export function FormKeyboardProvider({ children }: React.PropsWithChildren) {
  // Avoid preloading the keyboard during startup or a native screen transition.
  return <KeyboardProvider preload={false}>{children}</KeyboardProvider>;
}

export type FormScrollViewProps = ScrollViewProps & { bottomOffset?: number };
export const FormScrollView = forwardRef<ScrollViewInstance, FormScrollViewProps>(function FormScrollView(props, ref) {
  const attach = useCallback((instance: KeyboardAwareScrollViewRef | null) => {
    if (typeof ref === 'function') ref(instance);
    else if (ref) ref.current = instance;
  }, [ref]);
  return <KeyboardAwareScrollView ref={attach} bottomOffset={16} disableScrollOnKeyboardHide keyboardShouldPersistTaps="handled" {...props} />;
});
