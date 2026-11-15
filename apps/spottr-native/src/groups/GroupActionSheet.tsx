import React from 'react';
import {View} from 'react-native';
import {X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppSheet} from '../ui/AppSheet';
import {AppSheetScrollView} from '../ui/AppSheetScrollView';
import {GroupGlassButton} from './GroupGlassControls';
import {Text} from '../ui/Text';
import {colors} from '../ui/theme';
import {usePreferences} from '../usePreferences';
import {g} from './GroupPage';

/** A short, single-purpose surface. Navigation may run only after onDismiss. */
export function GroupActionSheet({title,children,footer,closing,onRequestClose,onDismiss,height=.48,testID='group-action-sheet'}:{title:string;children:React.ReactNode;footer?:React.ReactNode;closing:boolean;onRequestClose:()=>void;onDismiss:()=>void;height?:number;testID?:string}){
 const safe=useSafeAreaInsets(),{copy}=usePreferences();
 return <AppSheet open closing={closing} onClose={onDismiss} height={height} label={title} testID={testID} footer={footer?<View style={{paddingHorizontal:20,paddingTop:12,paddingBottom:Math.max(16,safe.bottom),backgroundColor:colors.bg,gap:10}}>{footer}</View>:undefined}>
  <View style={{paddingHorizontal:20,paddingBottom:8,paddingTop:12,flexDirection:'row',gap:12,alignItems:'center'}}><Text accessibilityRole="header" style={[g.heading,{flex:1}]}>{title}</Text><GroupGlassButton testID={testID+'-close'} accessibilityRole="button" accessibilityLabel={copy('common.close')} onPress={onRequestClose} style={{width:44,height:44,borderRadius:22,backgroundColor:colors.raised,alignItems:'center',justifyContent:'center'}}><X size={20} color={colors.text}/></GroupGlassButton></View>
  <AppSheetScrollView enableFooterMarginAdjustment={!!footer} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:20,paddingTop:8,paddingBottom:footer?24:Math.max(24,safe.bottom+16),gap:18}}>{children}</AppSheetScrollView>
 </AppSheet>;
}
