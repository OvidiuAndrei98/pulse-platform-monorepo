import React from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

/** Keep the existing material on Android, the web and older iOS builds. */
export function TabBarSurfaceFallback({ children, ...props }: ViewProps) {
  return (
    <View {...props}>
      {Platform.OS !== "web" && <>
        <BlurView pointerEvents="none" tint="dark" intensity={32} style={StyleSheet.absoluteFill} />
        <LinearGradient pointerEvents="none" colors={["rgba(31,31,31,0.48)", "rgba(26,26,26,0.58)", "rgba(18,18,18,0.7)"]} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.innerShadow]} />
      </>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  innerShadow: {
    borderRadius: 999,
    boxShadow: "inset 0 -8px 16px rgba(0,0,0,0.35)",
  },
});
