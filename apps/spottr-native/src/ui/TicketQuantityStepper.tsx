import React from 'react';
import {View,StyleSheet} from 'react-native';
import {Minus,Plus} from 'lucide-react-native';
import {ActionButton} from './ActionButton';
import {ValueText} from './StateMotion';
import {colors} from './theme';
import {usePreferences} from '../usePreferences';

export function TicketQuantityStepper({name,value,maximum,disabled,onStep,testIDPrefix}:{name:string;value:number;maximum:number;disabled?:boolean;onStep:(delta:number)=>void;testIDPrefix:string}) {
  const {copy}=usePreferences();
  return <View style={s.group}>
    <ActionButton testID={testIDPrefix+'-minus'} tone="ghost" accessibilityLabel={copy('checkout.decreaseQuantity',{name})} disabled={disabled||value<=0} onPress={()=>onStep(-1)} style={s.button}><Minus size={18} color="white"/></ActionButton>
    <ValueText testID={testIDPrefix+'-quantity'} accessibilityLabel={copy('checkout.quantity')+' · '+name} accessibilityLiveRegion="polite" style={s.value}>{value}</ValueText>
    <ActionButton testID={testIDPrefix+'-plus'} tone="ghost" accessibilityLabel={copy('checkout.increaseQuantity',{name})} disabled={disabled||value>=maximum} onPress={()=>onStep(1)} style={s.button}><Plus size={18} color="white"/></ActionButton>
  </View>;
}
const s=StyleSheet.create({group:{flexDirection:'row',alignItems:'center',borderRadius:99,borderWidth:1,borderColor:colors.inputBorder,backgroundColor:colors.raised,padding:2,gap:2},button:{width:44,height:44,paddingHorizontal:0,paddingVertical:0},value:{minWidth:26,textAlign:'center',color:colors.text,fontSize:16,fontWeight:'600'}});
