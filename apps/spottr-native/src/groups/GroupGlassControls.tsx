import React,{useRef,useState} from 'react';
import {Platform,Pressable,StyleSheet,View,type TextInputInstance} from 'react-native';
import {Search} from 'lucide-react-native';
import {GlassSurface,supportsLiquidGlass} from '../ui/GlassSurface';
import {GlassPressable} from '../ui/GlassPressable';
import {MotionPressable} from '../ui/MotionPressable';
import {FormInput,formStyles} from '../ui/FormInput';
import {colors} from '../ui/theme';
import {GlassInputSurface} from '../ui/GlassInputSurface';
import {useReducedTransparencyPreference} from '../ui/useReducedTransparencyPreference';

export function GroupControlSurface({children,style,...props}:React.ComponentProps<typeof View>){
 const reduced=useReducedTransparencyPreference();
 return supportsLiquidGlass&&!reduced?<GlassSurface {...props} interactive={false} style={style}>{children}</GlassSurface>:<View {...props} style={style}>{children}</View>;
}
export function GroupGlassButton({style,...props}:React.ComponentProps<typeof GlassPressable>){
 const reduced=useReducedTransparencyPreference();
 return supportsLiquidGlass&&!reduced?<GlassPressable {...props} style={style}/>:<MotionPressable {...props} style={style}/>;
}
export function GroupSearchField({value,onChangeText,label,inSheet=false,testID='group-event-search'}:{testID?:string;value:string;onChangeText:(text:string)=>void;label:string;inSheet?:boolean}){
 const input=useRef<TextInputInstance>(null);
 const [focused,setFocused]=useState(false);
 return <GlassInputSurface testID="group-search-surface" style={[s.search,focused&&s.focus]}>
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={()=>input.current?.focus()} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}><Search size={18} color={colors.muted}/></Pressable><FormInput ref={input} testID={testID} variant="bare" focusOwner="container" inSheet={inSheet} value={value} onChangeText={onChangeText} placeholder={label} accessibilityLabel={label} onFocus={Platform.OS==='web'?()=>setFocused(true):undefined} onBlur={Platform.OS==='web'?()=>setFocused(false):undefined} autoCorrect={false} autoCapitalize="none" returnKeyType="search" maxLength={120} style={s.input}/>
 </GlassInputSurface>;
}
const s=StyleSheet.create({search:{minHeight:44,borderRadius:formStyles.event.borderRadius,borderWidth:1,borderColor:colors.inputBorder,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',paddingRight:12,gap:0},focus:{borderColor:colors.focus},input:{flex:1,minWidth:0,height:44,paddingVertical:10,fontSize:16,color:colors.text,backgroundColor:'transparent',borderWidth:0}});
