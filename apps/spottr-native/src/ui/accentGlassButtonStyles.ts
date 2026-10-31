import type { ViewStyle } from 'react-native';
import { colors } from './theme';

export function isAccentFill(value: ViewStyle['backgroundColor']) {
  return typeof value === 'string' && value.toLowerCase() === colors.accent.toLowerCase();
}

// Keep external sizing on the glass and content layout on its full-size control.
// A text button must retain its intrinsic width, wrapping and flex allocation.
const contentKeys = [
  'alignItems', 'justifyContent', 'flexDirection', 'flexWrap', 'gap', 'rowGap', 'columnGap',
  'padding', 'paddingHorizontal', 'paddingVertical', 'paddingTop', 'paddingBottom',
  'paddingLeft', 'paddingRight', 'paddingStart', 'paddingEnd',
] as const;
const visualKeys = [
  'backgroundColor', 'borderWidth', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth', 'borderStartWidth', 'borderEndWidth',
  'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'borderStartColor', 'borderEndColor',
  'borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'borderTopStartRadius', 'borderTopEndRadius', 'borderBottomStartRadius', 'borderBottomEndRadius',
  'boxShadow', 'shadowColor', 'shadowOffset', 'shadowOpacity', 'shadowRadius', 'elevation', 'overflow',
] as const;

export function accentGlassButtonStyles(style: ViewStyle, disabled: boolean, accent = true) {
  const control: ViewStyle = { flexGrow: 1, flexShrink: 1, alignSelf: 'stretch', borderRadius: 999,
    opacity: style.opacity ?? (disabled ? .4 : 1) };
  for (const key of contentKeys) Object.assign(control, { [key]: style[key] });
  // Secondary state uses the same host and the original control's chrome. Its
  // focus and ref survive when selecting a chip turns its material on or off.
  if (!accent) for (const key of visualKeys) Object.assign(control, { [key]: style[key] });
  const surface: ViewStyle = {
    ...style, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 0, rowGap: 0, columnGap: 0,
    padding: 0, paddingHorizontal: 0, paddingVertical: 0, paddingTop: 0, paddingBottom: 0,
    paddingLeft: 0, paddingRight: 0, paddingStart: 0, paddingEnd: 0,
    borderRadius: 999, borderTopLeftRadius: 999, borderTopRightRadius: 999,
    borderBottomLeftRadius: 999, borderBottomRightRadius: 999,
    borderTopStartRadius: 999, borderTopEndRadius: 999, borderBottomStartRadius: 999, borderBottomEndRadius: 999,
    backgroundColor: 'transparent', borderColor: 'transparent', borderTopColor: 'transparent',
    borderBottomColor: 'transparent', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderStartColor: 'transparent', borderEndColor: 'transparent',
    boxShadow: 'none', shadowOpacity: 0, elevation: 0, overflow: 'visible', opacity: 1,
  };
  if (!accent) Object.assign(surface, {
    borderWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderStartWidth: 0, borderEndWidth: 0,
    borderRadius: style.borderRadius, borderTopLeftRadius: style.borderTopLeftRadius, borderTopRightRadius: style.borderTopRightRadius,
    borderBottomLeftRadius: style.borderBottomLeftRadius, borderBottomRightRadius: style.borderBottomRightRadius,
    borderTopStartRadius: style.borderTopStartRadius, borderTopEndRadius: style.borderTopEndRadius,
    borderBottomStartRadius: style.borderBottomStartRadius, borderBottomEndRadius: style.borderBottomEndRadius,
  });
  return { surface, control };
}
