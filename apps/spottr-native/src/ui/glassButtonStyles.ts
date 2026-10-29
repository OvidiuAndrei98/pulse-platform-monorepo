import type { ViewStyle } from 'react-native';

const paddingKeys = ['padding', 'paddingVertical', 'paddingHorizontal', 'paddingTop',
  'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingStart', 'paddingEnd'] as const;

/** Icon chrome only. Give UIKit one bounded circle, independent of parent flex. */
export function glassButtonStyles(style: ViewStyle, disabled: boolean) {
  const size = Math.max(44, typeof style.height === 'number' ? style.height : 44);
  const surface: ViewStyle = {
    alignSelf: 'flex-start',
    ...style,
    width: size, height: size, minWidth: size, minHeight: size,
    maxWidth: size, maxHeight: size, flex: undefined, flexBasis: 'auto', flexGrow: 0, flexShrink: 0,
    borderRadius: size / 2,
    borderTopLeftRadius: size / 2, borderTopRightRadius: size / 2,
    borderBottomLeftRadius: size / 2, borderBottomRightRadius: size / 2,
    backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0,
    borderTopWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
    boxShadow: 'none', shadowOpacity: 0, elevation: 0, overflow: 'visible', opacity: 1,
  };
  const control: ViewStyle = {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: surface.borderRadius,
    opacity: disabled ? 0.4 : style.opacity ?? 1,
  };
  for (const key of paddingKeys) {
    surface[key] = 0;
  }
  return { surface, control };
}
