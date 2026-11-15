import type { ColorValue, ViewProps } from 'react-native';

export type GlassSurfaceProps = ViewProps & { tintColor?: ColorValue; interactive?: boolean; glassEffectStyle?:import('expo-glass-effect').GlassViewProps['glassEffectStyle'] };
