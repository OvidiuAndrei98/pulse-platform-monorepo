import React from 'react';
import type { TextProps } from 'react-native';
import { Text } from './Text';

// Web and Android retain the exact existing text badge and its box styles.
export function GlassBadge(props: TextProps) {
  return <Text {...props} />;
}
