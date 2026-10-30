import type { TextInput as TextInputInstance } from 'react-native';
import React, { forwardRef, useContext, useState } from 'react';
import { Platform, StyleSheet, TextInput, useWindowDimensions, type TextInputProps } from 'react-native';
import { AppSheetTextInput } from './AppSheetTextInput';
import { AppFontsReadyContext } from './Text';

// Values from Next: events/form/FormField, profile/PersonalDetailsForm,
// checkout/InvoiceDetailsFields. Auth and search have their own icon containers.
export const formStyles = StyleSheet.create({
  event: { minHeight: 46, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff06', fontSize: 14, color: '#f7faf2', fontFamily: 'Inter_400Regular' },
  profile: { minHeight: 42, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff0d', fontSize: 14, color: '#f7faf2', fontFamily: 'Inter_400Regular' },
  billing: { height: 44, paddingHorizontal: 14, paddingVertical: 0, borderRadius: 12, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#ffffff09', fontSize: 16, color: '#ffffff', fontFamily: 'Inter_400Regular' },
  label: { fontSize: 14, fontWeight: '500', color: '#f7faf2d9' },
  profileLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1, color: '#9ca89e' },
  error: { color: '#f87171', fontSize: 12, lineHeight: 18 },
});
type Props = TextInputProps & { variant?: 'event' | 'profile' | 'billing' | 'bare'; invalid?: boolean; inSheet?: boolean; 'aria-invalid'?: boolean };
export const FormInput = forwardRef<TextInputInstance, Props>(function FormInput({ variant = 'event', invalid, inSheet, style, onFocus, onBlur, editable = true, ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const wide = useWindowDimensions().width >= 640;
  const Input = inSheet ? AppSheetTextInput : TextInput;
  const bad = invalid ?? props['aria-invalid'];
  const shape = StyleSheet.flatten(style);
  const fontsReady = useContext(AppFontsReadyContext);
  const fontFamily = shape?.fontFamily ?? (variant === 'bare' ? undefined : formStyles[variant].fontFamily);
  return <Input {...props} ref={ref as never} editable={editable} aria-invalid={!!bad} selectionColor="#ff0044" cursorColor="#ff0044"
    underlineColorAndroid="transparent" placeholderTextColor={props.placeholderTextColor ?? (variant === 'billing' ? '#ffffff59' : '#9ca89e99')}
    onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }}
    style={[
      variant !== 'bare' && formStyles[variant],
      variant === 'billing' && wide && { fontSize: 14 },
      props.multiline && { height: undefined, minHeight: variant === 'profile' ? 88 : 104, textAlignVertical: 'top', paddingVertical: 14 },
      style,
      !fontsReady && fontFamily?.startsWith('Inter_') && { fontFamily: undefined },
      typeof shape?.height === 'number' && shape.minHeight === undefined && { minHeight: shape.height },
      Platform.OS === 'web' && ({ outlineStyle: 'none', transition: 'border-color 160ms, background-color 160ms' } as never),
      focused && variant !== 'bare' && { borderColor: variant === 'profile' ? '#ff004480' : '#ff004499', ...(variant === 'event' ? { backgroundColor: '#ffffff0a' } : variant === 'profile' ? { backgroundColor: '#ffffff14' } : {}) },
      bad && { borderColor: '#f87171b3' },
      !editable && variant !== 'bare' && { opacity: 0.5 },
    ]} />;
});
