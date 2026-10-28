import React from 'react';
import { ArrowLeft, Bell, Bookmark, Search, Share2, X } from 'lucide-react-native';

const icons = { back: ArrowLeft, bell: Bell, bookmark: Bookmark, search: Search, share: Share2, close: X };
export type ActionIconProps = { name: keyof typeof icons; size?: number; color?: string; strokeWidth?: number; filled?: boolean };

export function ActionIconFallback({ name, size = 20, color = 'white', strokeWidth = 2, filled = false }: ActionIconProps) {
  const Icon = icons[name];
  return <Icon size={size} color={color} strokeWidth={strokeWidth} fill={filled ? color : 'none'} />;
}
