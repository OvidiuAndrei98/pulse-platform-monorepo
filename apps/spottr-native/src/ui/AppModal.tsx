import React from 'react';
import {useRef} from 'react';
import {KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,View,useWindowDimensions,type ViewInstance} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {X} from 'lucide-react-native';
import {usePreferences} from '../usePreferences';
import {colors,tokens} from './theme';
import {Text} from './Text';
import {ActionButton} from './ActionButton';
import {useReducedMotionPreference} from './useReducedMotionPreference';
export function AppModal({open,onClose,title,children,footer,dismissible=true}:{open:boolean;onClose:()=>void;title:string;children:React.ReactNode;footer?:React.ReactNode;dismissible?:boolean}){
 const {copy}=usePreferences(),reduced=useReducedMotionPreference(),insets=useSafeAreaInsets(),{height}=useWindowDimensions(),close=useRef<ViewInstance>(null);
 return <Modal visible={open} transparent animationType={reduced?'none':'fade'} accessibilityLabel={title} onShow={()=>{if(Platform.OS==='web')close.current?.focus();}} onRequestClose={()=>{if(dismissible)onClose();}} accessibilityViewIsModal>
  <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'} style={[s.backdrop,{paddingTop:Math.max(16,insets.top),paddingBottom:Math.max(16,insets.bottom),paddingLeft:Math.max(16,insets.left),paddingRight:Math.max(16,insets.right)}]}>
   <Pressable accessible={false} disabled={!dismissible} onPress={onClose} style={StyleSheet.absoluteFill}/>
   <View style={[s.panel,{maxHeight:Math.max(0,height-Math.max(16,insets.top)-Math.max(16,insets.bottom))}]} accessibilityLabel={title} accessibilityViewIsModal>
    <View style={s.header}><Text accessibilityRole="header" style={s.title}>{title}</Text><ActionButton ref={close} tone="secondary" accessibilityLabel={copy('common.close')} disabled={!dismissible} onPress={onClose} style={{width:44,paddingHorizontal:10}} icon={<X size={18}/>}/></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:24,gap:16}} style={{flexShrink:1}}>{children}</ScrollView>
    {footer&&<View style={s.footer}>{footer}</View>}
   </View>
  </KeyboardAvoidingView>
 </Modal>;
}
const s=StyleSheet.create({backdrop:{flex:1,backgroundColor:'#000000b3',justifyContent:'center',alignItems:'center'},panel:{width:'100%',maxWidth:520,flexShrink:1,backgroundColor:colors.overlay,borderRadius:tokens.radius.overlay,borderWidth:1,borderColor:colors.line,overflow:'hidden'},header:{padding:24,paddingBottom:0,flexDirection:'row',gap:12,alignItems:'center'},title:{flex:1,color:colors.text,fontSize:18,lineHeight:25,fontWeight:'700'},footer:{padding:24,paddingTop:12,flexDirection:'row',gap:12,flexWrap:'wrap'}});
