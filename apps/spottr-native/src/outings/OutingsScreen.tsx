import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOutingId } from '@packages/app-core/outings/model';
import { useOutings } from './useOutings';
import { PlanBuilder } from './PlanBuilder';
import { PlanDetails } from './PlanDetails';
import { SuggestForOuting } from './SuggestForOuting';
import { FormScrollView } from '../ui/KeyboardForms';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { useAuth } from '../auth/AuthProvider';

export function OutingsScreen({planId,eventId}:{planId?:string;eventId?:string}) {
  const {user}=useAuth();
  return <OutingsContent key={user?.id??'guest'} planId={planId} eventId={eventId}/>;
}
function OutingsContent({planId,eventId}:{planId?:string;eventId?:string}) {
  const model=useOutings(),{copy}=usePreferences(),navigation=useNavigation<any>(),safe=useSafeAreaInsets();
  const [selected,setSelected]=useState(isOutingId(planId)?planId:''),[building,setBuilding]=useState(false);
  useEffect(()=>{if(selected&&!model.pending)void model.store.loadPlan(selected);},[selected,model.pending,model.store]);
  const plan=model.plans.find(item=>item.id===selected);
  return <View testID="outings-screen" style={{flex:1,backgroundColor:colors.bg,paddingTop:safe.top}}>
    <FormScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:safe.bottom+36,gap:20,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <ActionButton title={copy('common.back')} tone="ghost" onPress={()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Tabs',{screen:'Profile'})}/>
      <Text accessibilityRole="header" style={{color:colors.text,fontSize:28,fontWeight:'700'}}>{copy('outings.title')}</Text>
      <Text style={{color:colors.muted}}>{copy('outings.hint')}</Text>
      {!model.user?<ActionButton title={copy('nav.profile')} onPress={()=>navigation.navigate('Auth',{returnOutings:true})}/>:<>
        {model.error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{copy(model.error)}</Text>}
        {model.notice&&<Text accessibilityLiveRegion="polite" style={{color:colors.success}}>{copy(model.notice)}</Text>}
        {model.pending?<ActivityIndicator color={colors.accent}/>:building?
          <PlanBuilder model={model} onCancel={()=>setBuilding(false)} onCreated={id=>{setBuilding(false);setSelected(id);}}/>:
          plan?<><ActionButton title={copy('outings.plans')} tone="ghost" onPress={()=>setSelected('')}/>
            <PlanDetails plan={plan} model={model} onEvent={id=>navigation.navigate('Event',{id})}
              onNight={eventId=>navigation.navigate('EventNight',{eventId})} onGroup={eventId=>navigation.navigate('SafetyGroup',{eventId})}/></>:
          <>
            {isOutingId(eventId)&&<SuggestForOuting eventId={eventId} model={model} onProposed={setSelected}/>}
            <ActionButton testID="outing-new" title={copy('outings.newPlan')} onPress={()=>setBuilding(true)}/>
            {!model.plans.length&&<Text style={{color:colors.muted}}>{copy('outings.empty')}</Text>}
            {model.plans.map(item=><ActionButton key={item.id} title={[item.title,item.outingDate,item.city].filter(Boolean).join(' · ')} tone="secondary" onPress={()=>setSelected(item.id)}/>)}
          </>}
        <ActionButton title={copy('outings.refresh')} tone="ghost" busy={model.refreshing} disabled={model.working} onPress={()=>void model.store.load()}/>
      </>}
    </FormScrollView>
  </View>;
}
