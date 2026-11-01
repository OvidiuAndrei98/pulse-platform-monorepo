import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../ui/theme';

// A flat accent fill with iOS continuous corners. Only the surrounding navbar
// uses Liquid Glass; adding glass here also changes the resting appearance.
// The selection's motion remains owned by FixedCapsuleTabBar, not UITabBar.
export function TabBarIndicatorSurface() {
  return <View testID="tab-flat-indicator-surface" pointerEvents="none" style={styles.fill} />;
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, borderRadius: 26, borderCurve: 'continuous', backgroundColor: `${colors.accent}73` },
});
