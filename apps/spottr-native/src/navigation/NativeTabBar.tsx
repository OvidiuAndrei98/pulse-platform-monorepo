import type { ComponentType } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { TabIndicatorMotion } from './useTabIndicator';

export type NativeTabBarProps = BottomTabBarProps & {
  activeIndex?: number;
  onSelectTab?: (name: string, gestureId?: number) => boolean | void;
  indicatorMotion?: TabIndicatorMotion;
};

// Android and browser navigation retain their current rendering and gestures.
export const NativeTabBar: ComponentType<NativeTabBarProps> | null = null;
