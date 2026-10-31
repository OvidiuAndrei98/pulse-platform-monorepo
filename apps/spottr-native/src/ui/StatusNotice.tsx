import React from 'react';
import {ActivityIndicator,StyleSheet,View} from 'react-native';
import {AlertCircle} from 'lucide-react-native';
import {Text} from './Text';
import {ActionButton} from './ActionButton';
import {colors,tokens} from './theme';
export function StatusNotice({kind='empty',title,detail,onRetry,retryLabel,busy=false}:{kind?:'empty'|'error'|'loading'|'success';title:string;detail?:string;onRetry?:()=>void;retryLabel?:string;busy?:boolean}){
 return <View style={s.root} accessibilityLiveRegion={kind==='error'?'assertive':'polite'} accessibilityRole={kind==='error'?'alert':undefined} accessibilityState={{busy:kind==='loading'||busy}}>
  {kind==='loading'?<ActivityIndicator color={colors.accent}/>:kind==='error'?<AlertCircle color={colors.danger} size={22}/>:null}
  <Text style={s.title}>{title}</Text>{detail&&<Text style={s.detail}>{detail}</Text>}
  {onRetry&&retryLabel&&<ActionButton tone="secondary" title={retryLabel} onPress={onRetry} busy={busy}/>}
 </View>;
}
const s=StyleSheet.create({root:{padding:tokens.spacing.xl,alignItems:'center',justifyContent:'center',gap:tokens.spacing.md,minWidth:0},title:{fontSize:16,lineHeight:24,fontWeight:'600',textAlign:'center',color:colors.text},detail:{fontSize:14,lineHeight:21,textAlign:'center',color:colors.muted,maxWidth:560}});
