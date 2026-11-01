import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../ui/theme';

/** Keep Android and web's existing flat accent selection. */
export function TabBarIndicatorSurface() {
  return <View pointerEvents="none" style={styles.fill} />;
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, borderRadius: 26, backgroundColor: `${colors.accent}40` },
});
