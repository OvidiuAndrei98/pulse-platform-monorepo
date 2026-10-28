import React from "react";
import { requireOptionalNativeModule } from "expo";
import type { SFSymbol } from "expo-symbols";
import { TabBarIconFallback, type TabBarIconProps } from "./TabBarIconFallback";

// Keep older installed development builds usable until native dependencies rebuild.
const NativeSymbol: typeof import("expo-symbols").SymbolView | null =
  requireOptionalNativeModule("SymbolModule") ? require("expo-symbols").SymbolView : null;

const symbols = [
  ["house", "house.fill"],
  ["map", "map.fill"],
  ["person.2", "person.2.fill"],
  ["person.crop.circle", "person.crop.circle.fill"],
] as const satisfies ReadonlyArray<readonly [SFSymbol, SFSymbol]>;

export function TabBarIcon(props: TabBarIconProps) {
  if (!NativeSymbol) return <TabBarIconFallback {...props} />;
  const names = symbols[props.index] ?? symbols[0];
  return (
    <NativeSymbol
      name={names[props.active ? 1 : 0]}
      size={props.size}
      tintColor={props.color}
      weight={props.active ? "semibold" : "regular"}
      type="monochrome"
      resizeMode="scaleAspectFit"
      accessible={false}
      pointerEvents="none"
    />
  );
}
