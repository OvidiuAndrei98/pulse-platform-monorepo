import type { ComponentType } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { TabIndicatorMotion } from './useTabIndicator';

export type NativeTabBarProps = BottomTabBarProps & {
  activeIndex?: number;
  onSelectTab?: (name: string, gestureId?: number) => boolean | void;
  indicatorMotion?: TabIndicatorMotion;
  /** A mounted but covered/hidden iOS navbar must not receive native gestures. */
  interactionEnabled?: boolean;
};

// Metro selects explicit .android / .web / .ios adapters. Keep the generic
// fallback available without probing for Liquid Glass here.
export const NativeTabBar: ComponentType<NativeTabBarProps> | null = null;
