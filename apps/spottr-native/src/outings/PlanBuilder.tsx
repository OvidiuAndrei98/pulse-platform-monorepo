import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { canCreatePlan, planningToday } from '@packages/app-core/outings/model';
import { eventCities } from '@packages/app-core/events/constants';
import { usePreferences } from '../usePreferences';
import { FormInput } from '../ui/FormInput';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { DateTimeField } from '../dashboard/DateTimeField';
import { DashboardDropdown } from '../dashboard/DashboardDropdown';
import { Choice } from './PlanChoice';
import type { useOutings } from './useOutings';
export { Choice } from './PlanChoice';

export function PlanBuilder({model,onCreated,onCancel}:{
  model:ReturnType<typeof useOutings>;onCreated:(id:string)=>void;onCancel:()=>void;
}) {
  const {copy}=usePreferences();
  const [title,setTitle]=useState(()=>copy('outings.defaultName'));
  const [day,setDay]=useState(planningToday),[city,setCity]=useState('Bucuresti');
  const [friends,setFriends]=useState<string[]>([]);
  useEffect(()=>{void model.store.searchEvents();},[model.store]);
  const create=async()=>{
    if(!canCreatePlan(title,day,city,friends))return;
    const result=await model.store.createPlan({title:title.trim(),outingDate:day,city,friendIds:friends});
    if(result)onCreated(result.id);
  };
  return <View style={{gap:18}}>
    <Text style={{color:colors.text,fontSize:20,fontWeight:'600'}}>{copy('outings.newPlan')}</Text>
    <Text style={{color:colors.text}}>{copy('outings.planName')}</Text>
    <FormInput testID="outing-title" value={title} onChangeText={setTitle} maxLength={80} accessibilityLabel={copy('outings.planName')} editable={!model.working}/>
    <DateTimeField dateOnly label={copy('outings.date')} value={day} onChange={setDay} disabled={model.working}/>
    <DashboardDropdown testID="outing-city" label={copy('outings.city')} placeholder={copy('outings.city')} value={city} onChange={setCity} options={eventCities.map(value=>({value,label:value}))} disabled={model.working}/>
    <Text style={{color:colors.muted,fontSize:12}}>{copy('outings.contextHint')}</Text>
    <Text style={{color:colors.text}}>{copy('outings.friends')}</Text>
    {!model.friends.length&&!model.catalogPending&&<Text style={{color:colors.muted}}>{copy('outings.noFriends')}</Text>}
    {model.friends.map(friend=><Choice key={friend.id} title={friend.username} selected={friends.includes(friend.id)}
      disabled={model.working||friends.length>=7&&!friends.includes(friend.id)}
      onPress={()=>setFriends(rows=>rows.includes(friend.id)?rows.filter(id=>id!==friend.id):[...rows,friend.id])}/>)}
    <ActionButton testID="outing-create" title={copy('outings.create')} busy={model.working} disabled={!canCreatePlan(title,day,city,friends)} onPress={()=>void create()}/>
    <ActionButton title={copy('common.cancel')} tone="ghost" disabled={model.working} onPress={onCancel}/>
  </View>;
}
