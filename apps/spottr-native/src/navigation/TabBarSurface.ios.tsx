import React from "react";
import { StyleSheet, type ViewProps } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { TabBarSurfaceFallback } from "./TabBarSurfaceFallback";

// A JS refresh can reach an older development binary before its Pods are rebuilt.
// Do not even import the native view manager when that binary lacks the module.
const glass: typeof import("expo-glass-effect") | null =
  requireOptionalNativeModule("ExpoGlassEffect") ? require("expo-glass-effect") : null;
const NativeGlassView = glass?.isLiquidGlassAvailable() && glass.isGlassEffectAPIAvailable()
  ? glass.GlassView
  : null;

export const usesLiquidGlass = NativeGlassView !== null;

export function TabBarSurface({ style, ...props }: ViewProps) {
  if (!NativeGlassView) return <TabBarSurfaceFallback {...props} style={style} />;
  // One material contains the real buttons: UIKit supplies its touch response,
  // highlights, shadow and accessibility appearance. Never fade this ancestor
  // to zero or cover it with the fallback's gradient/blur layers.
  return (
    <NativeGlassView
      {...props}
      style={[style, styles.glass]}
      glassEffectStyle="regular"
      colorScheme="dark"
      isInteractive
    />
  );
}

const styles = StyleSheet.create({
  glass: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    boxShadow: "none",
    overflow: "visible",
  },
});
