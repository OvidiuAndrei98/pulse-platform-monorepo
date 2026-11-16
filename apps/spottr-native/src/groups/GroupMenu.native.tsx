import React from 'react';
import {View} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {MoreHorizontal} from 'lucide-react-native';
import {FallbackGroupMenu} from './GroupMenuFallback';
import type {GroupMenuProps} from './groupMenuTypes';
import {GroupControlSurface} from './GroupGlassControls';
import {colors} from '../ui/theme';
const menu:typeof import('@expo/ui/community/menu')|null=requireOptionalNativeModule('ExpoUI')?require('@expo/ui/community/menu'):null;
/** The installed ExpoUI system menu owns its presentation, keyboard and dismissal. */
export function GroupMenu(props:GroupMenuProps){
 // A one-action menu uses our existing anchored surface instead of the
 // system menu's wide minimum frame. Multi-action system menus stay native.
 if(!menu||props.items.length===1)return <FallbackGroupMenu {...props}/>;
 const {MenuView}=menu,Icon=props.icon??MoreHorizontal;
 return <MenuView testID={props.testID} colorScheme="dark" style={{width:44,height:44}} actions={props.items.map(item=>({id:item.id,title:item.label,image:item.nativeImage as import('@expo/ui/community/menu').MenuAction['image'],attributes:{disabled:item.disabled||props.disabled,destructive:item.destructive}}))} onPressAction={event=>{const item=props.items.find(item=>item.id===event.nativeEvent.event);if(!props.disabled&&!item?.disabled)item?.onPress()}}>
  <View accessibilityRole="button" accessibilityLabel={props.label} accessibilityState={{disabled:props.disabled}}><GroupControlSurface style={{width:44,height:44,borderRadius:22,backgroundColor:colors.raised,justifyContent:'center',alignItems:'center'}}><Icon size={22} color={colors.text}/></GroupControlSurface></View>
 </MenuView>;
}
export type {GroupMenuProps,GroupMenuItem} from './groupMenuTypes';
