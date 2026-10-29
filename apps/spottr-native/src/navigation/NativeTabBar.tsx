import type { ComponentType } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

export type NativeTabBarProps = BottomTabBarProps & {
  activeIndex?: number;
  onSelectTab?: (name: string) => void;
};

// Android and browser navigation retain their current rendering and gestures.
export const NativeTabBar: ComponentType<NativeTabBarProps> | null = null;
