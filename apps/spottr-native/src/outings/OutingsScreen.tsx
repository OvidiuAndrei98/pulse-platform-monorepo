import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOutings } from './useOutings';
import { PlanBuilder } from './PlanBuilder';
import { PlanDetails } from './PlanDetails';
import { TicketTransfers } from './TicketTransfers';
import { FormScrollView } from '../ui/KeyboardForms';
import { GlassSegmentedControl } from '../ui/GlassSegmentedControl';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { useAuth } from '../auth/AuthProvider';

export function OutingsScreen({planId,ticketId,initialTab}:{planId?:string;ticketId?:string;initialTab?:'plans'|'transfers'}) {
  const {user}=useAuth();return <OutingsContent key={user?.id??'guest'} planId={planId} ticketId={ticketId} initialTab={initialTab}/>;
}
function OutingsContent({planId,ticketId,initialTab}:{planId?:string;ticketId?:string;initialTab?:'plans'|'transfers'}) {
  const model=useOutings(),{copy}=usePreferences(),navigation=useNavigation<any>(),safe=useSafeAreaInsets();
  const [tab,setTab]=useState<'plans'|'transfers'>(initialTab??(ticketId?'transfers':'plans')),[selected,setSelected]=useState(planId??''),[building,setBuilding]=useState(false);
  const plan=model.plans.find(p=>p.id===selected);
  return <View testID="outings-screen" style={{flex:1,backgroundColor:colors.bg,paddingTop:safe.top}}>
    <FormScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:safe.bottom+36,gap:20,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <ActionButton title={copy('common.back')} tone="ghost" onPress={()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Tabs',{screen:'Profile'})}/>
      <Text accessibilityRole="header" style={{color:colors.text,fontSize:28,fontWeight:'700'}}>{copy('outings.title')}</Text>
      <Text style={{color:colors.muted}}>{copy('outings.hint')}</Text>
      {!model.user?<ActionButton title={copy('nav.profile')} onPress={()=>navigation.navigate('Auth',{returnOutings:true})}/>:<>
        <GlassSegmentedControl value={tab} onChange={setTab} role="tab" disabled={model.working} options={[{value:'plans',label:copy('outings.plans')},{value:'transfers',label:copy('outings.transfers')}]}/>
        {model.error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{copy(model.error)}</Text>}
        {model.notice&&<Text accessibilityLiveRegion="polite" style={{color:colors.success}}>{copy(model.notice)}</Text>}
        {model.pending?<ActivityIndicator color={colors.accent}/>:tab==='transfers'?<TicketTransfers model={model} initialTicketId={ticketId} onTickets={()=>navigation.navigate('Tickets')}/>
          :building?<PlanBuilder model={model} onCancel={()=>setBuilding(false)} onCreated={id=>{setBuilding(false);setSelected(id);}}/>
          :plan?<><ActionButton title={copy('outings.plans')} tone="ghost" onPress={()=>setSelected('')}/><PlanDetails plan={plan} model={model} onEvent={id=>navigation.navigate('Event',{id})}/></>
          :<><ActionButton testID="outing-new" title={copy('outings.newPlan')} onPress={()=>setBuilding(true)}/>
            {!model.plans.length&&<Text style={{color:colors.muted}}>{copy('outings.empty')}</Text>}
            {model.plans.map(p=><ActionButton key={p.id} title={p.title+' · '+copy('outings.'+p.status)} tone="secondary" onPress={()=>setSelected(p.id)}/>)}</>}
        <ActionButton title={copy('outings.refresh')} tone="ghost" busy={model.refreshing} disabled={model.working} onPress={()=>void model.store.load()}/>
      </>}
    </FormScrollView>
  </View>;
}
