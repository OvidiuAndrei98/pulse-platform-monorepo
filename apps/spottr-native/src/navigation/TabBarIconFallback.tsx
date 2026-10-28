import React from "react";
import { Map, UsersRound, UserRound } from "lucide-react-native";
import Svg, { Path, Polyline } from "react-native-svg";

export type TabBarIconProps = {
  index: number;
  active: boolean;
  size: number;
  color: string;
  strokeWidth: number;
};

// Preserve the original Next.js Home artwork on the cross-platform fallback.
function HomeIcon({ size, color, strokeWidth }: Omit<TabBarIconProps, "index" | "active">) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
    <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <Polyline points="9 22 9 12 15 12 15 22" />
  </Svg>;
}

const icons = [HomeIcon, Map, UsersRound, UserRound];

export function TabBarIconFallback({ index, active: _active, ...props }: TabBarIconProps) {
  const Icon = icons[index] ?? HomeIcon;
  return <Icon {...props} />;
}
