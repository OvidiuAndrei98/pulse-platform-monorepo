import type { ScrollViewInstance } from 'react-native';
import React, { forwardRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

export type FormScrollViewProps = ScrollViewProps & { bottomOffset?: number; disableScrollOnKeyboardHide?: boolean };
export const FormScrollView = forwardRef<ScrollViewInstance, FormScrollViewProps>(function FormScrollView({ bottomOffset: _bottomOffset, disableScrollOnKeyboardHide: _disableScrollOnKeyboardHide, ...props }, ref) {
  return <ScrollView ref={ref} {...props} />;
});

export function FormKeyboardProvider({ children }: React.PropsWithChildren) { return <>{children}</>; }
export function KeyboardFooter({ children }: React.PropsWithChildren) { return <>{children}</>; }
