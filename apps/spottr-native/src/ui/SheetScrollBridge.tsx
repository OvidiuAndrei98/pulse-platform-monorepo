import React from 'react';
import type { View as ViewInstance } from 'react-native';
import type { GestureEventsHandlersHookType } from '@gorhom/bottom-sheet';

// Native scroll views already cooperate with Gorhom's UI-thread pan gesture.
export function SheetScrollProvider({ children }: React.PropsWithChildren) { return <>{children}</>; }
export const sheetGestureHandlersHook: GestureEventsHandlersHookType | undefined = undefined;
export function useSheetScrollSurface(_surface: React.RefObject<ViewInstance | null>) {}
