import React,{useState} from 'react';
import {View,useWindowDimensions} from 'react-native';
import {X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AppSheet} from '../ui/AppSheet';
import {AppSheetScrollView} from '../ui/AppSheetScrollView';
import {GroupGlassButton} from './GroupGlassControls';
import {GroupBack} from './GroupBack';
import {Text} from '../ui/Text';
import {colors} from '../ui/theme';
import {usePreferences} from '../usePreferences';
import {g} from './GroupPage';
import {drawerDesign} from '@packages/app-core/presentation/drawerDesign';

/** A short, single-purpose surface. Navigation may run only after onDismiss. */
export function GroupActionSheet({title,children,footer,closing,onRequestClose,onDismiss,height=.88,testID='group-action-sheet',contentEstimate=240,horizontalContent=false,onBack,scrollRef,onScroll}:{title:string;children:React.ReactNode;footer?:React.ReactNode;closing:boolean;onRequestClose:()=>void;onDismiss:()=>void;height?:number;testID?:string;contentEstimate?:number;horizontalContent?:boolean;onBack?:()=>void;scrollRef?:React.ComponentProps<typeof AppSheetScrollView>['ref'];onScroll?:React.ComponentProps<typeof AppSheetScrollView>['onScroll']}){
 const safe=useSafeAreaInsets(),viewport=useWindowDimensions(),{copy}=usePreferences();
 const [bodyHeight,setBodyHeight]=useState(contentEstimate),[headerHeight,setHeaderHeight]=useState(64),[footerHeight,setFooterHeight]=useState(footer?68+Math.max(16,safe.bottom):0);
 const bodyPaddingBottom=footer?20:Math.max(24,safe.bottom+16);
 const desired=drawerDesign.handleAreaHeight+headerHeight+bodyHeight+footerHeight+8+bodyPaddingBottom;
 const ratio=Math.min(height,(viewport.height-safe.top-8)/viewport.height,Math.max(180,desired)/viewport.height);
 return <AppSheet open contentSized horizontalContent={horizontalContent} closing={closing} onClose={onDismiss} height={ratio} label={title} testID={testID} footer={footer?<View onLayout={event=>setFooterHeight(event.nativeEvent.layout.height)} style={{paddingHorizontal:20,paddingTop:12,paddingBottom:Math.max(16,safe.bottom),backgroundColor:colors.bg,gap:10}}>{footer}</View>:undefined}>
  <View onLayout={event=>setHeaderHeight(event.nativeEvent.layout.height)} style={{paddingHorizontal:20,paddingBottom:8,paddingTop:12,flexDirection:'row',gap:12,alignItems:'center'}}>{onBack&&<GroupBack testID={testID+'-back'} onPress={onBack}/>}<Text accessibilityRole="header" style={[g.heading,{flex:1}]}>{title}</Text><GroupGlassButton testID={testID+'-close'} accessibilityRole="button" accessibilityLabel={copy('common.close')} onPress={onRequestClose} style={{width:44,height:44,borderRadius:22,backgroundColor:colors.raised,alignItems:'center',justifyContent:'center'}}><X size={20} color={colors.text}/></GroupGlassButton></View>
  <AppSheetScrollView ref={scrollRef} onScroll={onScroll} enableFooterMarginAdjustment={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingHorizontal:20,paddingTop:8,paddingBottom:bodyPaddingBottom,gap:18}}><View onLayout={event=>setBodyHeight(event.nativeEvent.layout.height)} style={{gap:16}}>{children}</View></AppSheetScrollView>
 </AppSheet>;
}
