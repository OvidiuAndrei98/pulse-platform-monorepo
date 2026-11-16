import React from 'react';
import {View} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {ChevronDown,MapPin} from 'lucide-react-native';
import {DashboardDropdown,type DashboardDropdownProps} from '../dashboard/DashboardDropdown';
import {GlassSurface,supportsLiquidGlass} from '../ui/GlassSurface';
import {useReducedTransparencyPreference} from '../ui/useReducedTransparencyPreference';
import {Text} from '../ui/Text';
import {colors,tokens} from '../ui/theme';

const menu:typeof import('@expo/ui/community/menu')|null=requireOptionalNativeModule('ExpoUI')?require('@expo/ui/community/menu'):null;

/** The system owns this anchored menu; it never stacks another sheet over the editor. */
export function GroupCityField(props:DashboardDropdownProps){
 const reduced=useReducedTransparencyPreference();
 if(!supportsLiquidGlass||reduced||!menu)return <DashboardDropdown {...props}/>;
 const {MenuView}=menu,{label,value,options,onChange,placeholder,disabled,testID,error,hideLabel}=props;
 const selected=options.find(option=>option.value===value),Icon=props.icon??MapPin;
 return <View style={{gap:8}}>
  {!hideLabel&&<Text style={{fontSize:14,fontWeight:'500',color:colors.text}}>{label}</Text>}
  <MenuView testID={testID} style={{height:48,width:'100%',opacity:disabled?.5:1}} actions={options.map(option=>({id:option.value,title:option.label,state:option.value===value?'on':'off',attributes:{disabled}}))} onPressAction={event=>{if(disabled)return;const option=options.find(item=>item.value===event.nativeEvent.event);if(option&&option.value!==value)onChange(option.value)}}>
   <View accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{text:selected?.label??placeholder}} accessibilityState={{disabled}} style={{width:'100%',height:48}}>
    <GlassSurface interactive style={[{height:48,width:'100%',borderRadius:tokens.radius.pill,backgroundColor:colors.surface,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:16},props.triggerStyle]}>
     <Icon size={18} color={colors.muted}/><Text numberOfLines={1} style={{flex:1,minWidth:0,fontSize:16,color:selected?colors.text:colors.muted}}>{selected?.label??placeholder}</Text><ChevronDown size={16} color={colors.muted}/>
    </GlassSurface>
   </View>
  </MenuView>
  {!!error&&<Text accessibilityRole="alert" style={{fontSize:12,lineHeight:18,color:colors.danger}}>{error}</Text>}
 </View>;
}
