import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { FormScrollView } from '../ui/KeyboardForms';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { useOutings } from './useOutings';
import { TicketTransfers } from './TicketTransfers';

export function TicketTransfersScreen({ticketId}:{ticketId?:string}) {
  const {user}=useAuth();return <Transfers key={user?.id??'guest'} ticketId={ticketId}/>;
}
function Transfers({ticketId}:{ticketId?:string}) {
  const model=useOutings('transfers'),{copy}=usePreferences(),navigation=useNavigation<any>(),safe=useSafeAreaInsets();
  return <View style={{flex:1,backgroundColor:colors.bg,paddingTop:safe.top}}><FormScrollView keyboardShouldPersistTaps="handled"
    contentContainerStyle={{padding:20,paddingBottom:safe.bottom+36,gap:20,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <ActionButton title={copy('common.back')} tone="ghost" onPress={()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Tabs',{screen:'Profile'})}/>
    <Text accessibilityRole="header" style={{color:colors.text,fontSize:28,fontWeight:'700'}}>{copy('outings.transfers')}</Text>
    {!model.user?<ActionButton title={copy('nav.profile')} onPress={()=>navigation.navigate('Auth',{returnTicketTransfers:true})}/>:<>
      {model.error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{copy(model.error)}</Text>}
      {model.notice&&<Text accessibilityLiveRegion="polite" style={{color:colors.success}}>{copy(model.notice)}</Text>}
      {model.pending?<ActivityIndicator color={colors.accent}/>:<TicketTransfers model={model} initialTicketId={ticketId} onTickets={()=>navigation.navigate('Tickets')}/>}
      <ActionButton title={copy('outings.refresh')} tone="ghost" busy={model.refreshing} disabled={model.working} onPress={()=>void model.store.load()}/>
    </>}
  </FormScrollView></View>;
}
