import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { matchesPlanningContext } from '@packages/app-core/outings/model';
import { eventsApi } from '../data/api';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import type { useOutings } from './useOutings';

export function SuggestForOuting({eventId,model,onProposed}:{
  eventId:string;model:ReturnType<typeof useOutings>;onProposed:(id:string)=>void;
}) {
  const {copy}=usePreferences();
  const event=useQuery({queryKey:['outing-suggestion',model.user?.id,eventId],queryFn:({signal})=>eventsApi.event(eventId,signal),retry:false});
  const plans=model.plans.filter(plan=>plan.status==='accepted'&&!plan.chosenEventId&&plan.options.length<8&&event.data&&matchesPlanningContext(event.data,plan));
  return <View style={{gap:12}}>
    <Text style={{color:colors.text,fontSize:20,fontWeight:'600'}}>{copy('outings.selectPlan')}</Text>
    {event.isError?<ActionButton title={copy('common.retry')} onPress={()=>void event.refetch()}/>:!event.isPending&&!plans.length&&<Text style={{color:colors.muted}}>{copy('outings.noMatchingPlans')}</Text>}
    {plans.map(plan=><ActionButton key={plan.id} testID={'outing-suggest-'+plan.id} title={plan.title} tone="secondary" disabled={model.working}
      onPress={()=>void model.store.propose(plan.id,eventId).then(result=>{if(result)onProposed(plan.id);})}/>)}
  </View>;
}
