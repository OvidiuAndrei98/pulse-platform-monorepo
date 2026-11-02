import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { matchesPlanningContext, type OutingPlan } from '@packages/app-core/outings/model';
import { FormInput } from '../ui/FormInput';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import type { useOutings } from './useOutings';

export function PlanProposals({plan,model}:{plan:OutingPlan;model:ReturnType<typeof useOutings>}) {
  const {copy}=usePreferences(),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  useEffect(()=>{
    const timer=setTimeout(()=>{setPage(1);void model.store.searchEvents(search,1,plan);},250);
    return()=>clearTimeout(timer);
  },[search,model.store,plan.id,plan.outingDate,plan.city]);
  const events=model.events.filter(event=>matchesPlanningContext(event,plan));
  return <View style={{gap:12}}>
    <Text style={{color:colors.text,fontWeight:'600'}}>{copy('outings.propose')}</Text>
    <Text style={{color:colors.muted}}>{copy('outings.proposeHint')}</Text>
    <FormInput testID="outing-search" accessibilityLabel={copy('outings.search')} placeholder={copy('outings.search')} value={search} onChangeText={setSearch}/>
    {events.map(event=><ActionButton key={event.id} testID={'outing-propose-'+event.id} title={event.title} tone="secondary"
      disabled={model.working||plan.options.length>=8||plan.options.some(option=>option.eventId===event.id)}
      onPress={()=>void model.store.propose(plan.id,event.id)}/>)}
    {model.moreEvents&&<ActionButton title={copy('outings.more')} tone="ghost" busy={model.catalogPending}
      onPress={()=>{setPage(page+1);void model.store.searchEvents(search,page+1,plan);}}/>}
  </View>;
}
