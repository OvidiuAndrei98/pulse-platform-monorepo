import React from 'react';
import { ReduceMotion, ReducedMotionConfig, useReducedMotion } from 'react-native-reanimated';
import { useReducedMotionPreference } from './useReducedMotionPreference';

export function InterfaceProvider({ children }: React.PropsWithChildren) {
  const reduced = useReducedMotionPreference();
  const initial = useReducedMotion();
  // Reanimated owns the initial system configuration. Only override it when
  // the live accessibility preference differs from its startup snapshot.
  return <>
    {reduced !== initial && <ReducedMotionConfig mode={reduced ? ReduceMotion.Always : ReduceMotion.Never} />}
    {children}
  </>;
}
