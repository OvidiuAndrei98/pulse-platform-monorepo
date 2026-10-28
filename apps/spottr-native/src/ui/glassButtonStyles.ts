import type { ViewStyle } from 'react-native';

const paddingKeys = ['padding', 'paddingVertical', 'paddingHorizontal', 'paddingTop',
  'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingStart', 'paddingEnd'] as const;

/** Keep the whole surface tappable: padding belongs to the inner control. */
export function glassButtonStyles(style: ViewStyle, disabled: boolean) {
  const surface: ViewStyle = {
    borderRadius: 999, minWidth: 44, minHeight: 44, alignSelf: 'flex-start',
    ...style,
    backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0,
    borderTopWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
    boxShadow: 'none', shadowOpacity: 0, elevation: 0, overflow: 'visible', opacity: 1,
  };
  const control: ViewStyle = {
    flexGrow: 1, alignSelf: 'stretch', alignItems: style.alignItems ?? 'center',
    justifyContent: style.justifyContent ?? 'center', flexDirection: style.flexDirection,
    gap: style.gap, columnGap: style.columnGap, rowGap: style.rowGap,
    borderRadius: surface.borderRadius,
    opacity: disabled ? 0.4 : style.opacity ?? 1,
  };
  for (const key of paddingKeys) {
    control[key] = style[key];
    surface[key] = 0;
  }
  return { surface, control };
}
