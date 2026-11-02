import React from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';

export function Choice({title,hint,selected,disabled,onPress}:{
  title:string;hint?:string;selected:boolean;disabled?:boolean;onPress:()=>void;
}) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{checked:selected,disabled}} disabled={disabled} onPress={onPress}
    style={{borderWidth:1,borderColor:selected?colors.accent:colors.line,borderRadius:18,padding:14,minHeight:52,flexDirection:'row',gap:12,alignItems:'center',opacity:disabled?.5:1}}>
    <View style={{flex:1,minWidth:0}}><Text style={{color:colors.text,fontWeight:'600'}}>{title}</Text>
      {hint&&<Text style={{color:colors.muted,fontSize:12,marginTop:4}}>{hint}</Text>}</View>
    {selected&&<Check size={20} color={colors.accent}/>}
  </Pressable>;
}
