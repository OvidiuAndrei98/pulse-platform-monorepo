import React, {cloneElement,forwardRef,useState,type ReactElement} from 'react';
import {ActivityIndicator, Platform, StyleSheet, type PressableProps, type ViewInstance} from 'react-native';
import {MotionPressable} from './MotionPressable';
import {AccentPressable} from './AccentPressable';
import {Text} from './Text';
import {colors,tokens} from './theme';
import {ActionTextContext} from './ActionTextContext';
export type ActionTone='primary'|'secondary'|'ghost'|'danger'|'warning'|'success';
type Props=PressableProps&{title?:string;children?:React.ReactNode;icon?:ReactElement<{color?:string}>;tone?:ActionTone;size?:'regular'|'large'|'compact';busy?:boolean};
export const ActionButton=forwardRef<ViewInstance,Props>(function ActionButton({title,children,icon,tone='primary',size='regular',busy=false,disabled,style,onPress,onFocus,onBlur,...props},ref){
  const [focused,setFocused]=useState(false);
  const foreground=tone==='primary'?colors.onAction:tone==='danger'?colors.danger:tone==='warning'?colors.warning:tone==='success'?colors.success:colors.text;
  return <AccentPressable {...props} fallback={MotionPressable} glassColor={tone==='primary'?colors.accent:undefined} ref={ref} accessibilityRole={props.accessibilityRole??'button'} accessibilityState={{...props.accessibilityState,disabled:!!disabled||busy,busy:busy||props.accessibilityState?.busy}}
    disabled={disabled||busy} onPress={event=>{if(!busy)onPress?.(event);}} onFocus={event=>{setFocused(Platform.OS!=='web'||!!(event.currentTarget as unknown as HTMLElement).matches?.(':focus-visible'));onFocus?.(event);}} onBlur={event=>{setFocused(false);onBlur?.(event);}}
    style={state=>{
      const custom=typeof style==='function'?style(state):style,flat=StyleSheet.flatten(custom);
      return [s.button,custom,s[tone],{height:typeof flat?.height==='number'?undefined:flat?.height,borderRadius:tokens.radius.pill,minHeight:Math.max(tokens.control[size],typeof flat?.minHeight==='number'?flat.minHeight:0,typeof flat?.height==='number'?flat.height:0),opacity:disabled?.45:1},Platform.OS==='web'&&focused&&s.focus,Platform.OS==='web'&&focused&&tone==='primary'&&{boxShadow:`0 0 0 6px ${colors.focusHalo}`}];
    }}>
    <ActionTextContext.Provider value={foreground}>{busy&&<ActivityIndicator color={foreground}/>}{icon&&cloneElement(icon,{color:foreground})}{title?<Text style={s.label}>{title}</Text>:children}</ActionTextContext.Provider>
  </AccentPressable>;
});
const s=StyleSheet.create({
  button:{minWidth:0,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingHorizontal:20,paddingVertical:10,borderWidth:1,borderColor:'transparent',borderRadius:tokens.radius.pill},
  primary:{backgroundColor:colors.action},secondary:{backgroundColor:colors.raised,borderColor:colors.inputBorder},ghost:{backgroundColor:'transparent'},danger:{backgroundColor:tokens.colors.dangerSurface,borderColor:colors.danger},warning:{backgroundColor:tokens.colors.warningSurface,borderColor:colors.warning},success:{backgroundColor:tokens.colors.successSurface,borderColor:colors.success},
  label:{fontSize:tokens.type.label.size,lineHeight:tokens.type.label.size*tokens.type.label.lineHeight,fontWeight:'600',textAlign:'center',flexShrink:1},
  focus:{outlineColor:colors.focus,outlineWidth:2,outlineStyle:'solid',outlineOffset:3},
});
