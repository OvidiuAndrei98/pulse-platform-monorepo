import type { TextInputInstance } from 'react-native';
import React, { forwardRef, useContext, useState } from 'react';
import { Platform, StyleSheet, TextInput, useWindowDimensions, type TextInputProps } from 'react-native';
import { AppSheetTextInput } from './AppSheetTextInput';
import { AppFontsReadyContext } from './Text';
import {colors,tokens} from './theme';

// Values from Next: events/form/FormField, profile/PersonalDetailsForm,
// checkout/InvoiceDetailsFields. Auth and search have their own icon containers.
export const formStyles = StyleSheet.create({
  event: { minHeight:44,paddingHorizontal:tokens.control.fieldPaddingInline,paddingVertical:tokens.control.fieldPaddingBlock,borderRadius:tokens.radius.field,borderWidth:1,borderColor:colors.inputBorder,backgroundColor:colors.surface,fontSize:tokens.type.body.size,lineHeight:tokens.type.body.size*tokens.type.body.lineHeight,color:colors.text,fontFamily:'Inter_400Regular' },
  profile: { minHeight:44,paddingHorizontal:tokens.control.fieldPaddingInline,paddingVertical:tokens.control.fieldPaddingBlock,borderRadius:tokens.radius.field,borderWidth:1,borderColor:colors.inputBorder,backgroundColor:colors.surface,fontSize:tokens.type.body.size,lineHeight:tokens.type.body.size*tokens.type.body.lineHeight,color:colors.text,fontFamily:'Inter_400Regular' },
  billing: { minHeight:44,paddingHorizontal:tokens.control.fieldPaddingInline,paddingVertical:tokens.control.fieldPaddingBlock,borderRadius:tokens.radius.field,borderWidth:1,borderColor:colors.inputBorder,backgroundColor:colors.surface,fontSize:tokens.type.body.size,lineHeight:tokens.type.body.size*tokens.type.body.lineHeight,color:colors.text,fontFamily:'Inter_400Regular' },
  label: {fontSize:14,lineHeight:21,fontWeight:'600',color:colors.text},
  profileLabel: {fontSize:14,lineHeight:21,fontWeight:'600',color:colors.text},
  error: {color:colors.danger,fontSize:12,lineHeight:18},
});
type Props = TextInputProps & { variant?: 'event' | 'profile' | 'billing' | 'bare'; invalid?: boolean; inSheet?: boolean; 'aria-invalid'?: boolean; focusOwner?: 'self' | 'container' };
export const FormInput = forwardRef<TextInputInstance, Props>(function FormInput({ variant = 'event', invalid, inSheet, style, onFocus, onBlur, editable = true, focusOwner = 'self', ...props }, ref) {
  const [focused, setFocused] = useState(false);
  const Input = inSheet ? AppSheetTextInput : TextInput;
  const bad = invalid ?? props['aria-invalid'];
  const shape = StyleSheet.flatten(style);
  const fontsReady = useContext(AppFontsReadyContext);
  const fontFamily = shape?.fontFamily ?? (variant === 'bare' ? undefined : formStyles[variant].fontFamily);
  return <Input {...props} ref={ref as never} editable={editable} aria-invalid={!!bad} selectionColor="#ff0044" cursorColor="#ff0044"
    underlineColorAndroid="transparent" placeholderTextColor={colors.muted}
    onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }}
    style={[
      variant !== 'bare' && formStyles[variant],

      props.multiline && { height: undefined, minHeight: variant === 'profile' ? 88 : 104, textAlignVertical: 'top', paddingVertical: 14 },
      style,
      {fontSize:Math.max(16,shape?.fontSize??16)},
      variant!=='bare'&&{height:undefined,minHeight:Math.max(props.multiline?104:tokens.control.regular,typeof shape?.minHeight==='number'?shape.minHeight:0,typeof shape?.height==='number'?shape.height:0),paddingHorizontal:tokens.control.fieldPaddingInline,paddingVertical:props.multiline?14:tokens.control.fieldPaddingBlock,lineHeight:tokens.type.body.size*tokens.type.body.lineHeight,borderRadius:tokens.radius.field,borderWidth:1,borderColor:colors.inputBorder,backgroundColor:colors.surface},
      !fontsReady && fontFamily?.startsWith('Inter_') && { fontFamily: undefined },
      variant==='bare'&&typeof shape?.height === 'number' && shape.minHeight === undefined && { minHeight: shape.height },
      Platform.OS === 'web' && ({outlineStyle:'solid',outlineWidth:focused&&focusOwner==='self'?2:0,outlineColor:colors.focus,outlineOffset:3} as never),
      focused&&variant!=='bare'&&{borderColor:colors.focus},
      bad&&{borderColor:colors.danger},
      !editable && variant !== 'bare' && { opacity: 0.5 },
    ]} />;
});
