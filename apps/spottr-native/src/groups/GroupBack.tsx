import React from 'react';
import {GlassPressable} from '../ui/GlassPressable';
import {ActionIcon} from '../ui/ActionIcon';
import {usePreferences} from '../usePreferences';
import {colors} from '../ui/theme';
export function GroupBack({onPress,testID}:{onPress:()=>void;testID?:string}){
 const {copy}=usePreferences('copy');
 return <GlassPressable testID={testID} accessibilityRole="button" accessibilityLabel={copy('common.back')} onPress={onPress} style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.raised}}><ActionIcon name="back" size={22} color={colors.text}/></GlassPressable>;
}
