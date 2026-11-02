import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { canCreatePlan, type OutingPlan, type OutingsStore, type PlanEvent } from '@packages/app-core/outings/model';
import { usePreferences } from '../usePreferences';
import { FormInput } from '../ui/FormInput';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { formatDate } from '../data/events';
import type { useOutings } from './useOutings';

export function PlanBuilder({model,onCreated,onCancel}:{model:ReturnType<typeof useOutings>;onCreated:(id:string)=>void;onCancel:()=>void}) {
  const {copy,language}=usePreferences();
  const [title,setTitle]=useState(()=>copy('outings.defaultName')),[search,setSearch]=useState(''),[selected,setSelected]=useState<PlanEvent[]>([]),[friends,setFriends]=useState<string[]>([]),[page,setPage]=useState(1);
  useEffect(()=>{const timer=setTimeout(()=>{setPage(1);void model.store.searchEvents(search);},250);return()=>clearTimeout(timer);},[search,model.store]);
  const create=async()=>{
    const payload={title:title.trim(),eventIds:selected.map(e=>e.id),friendIds:friends};
    if(!canCreatePlan(payload.title,payload.eventIds,friends))return;
    const result=await model.store.createPlan(payload);
    if(result)onCreated(result.id);
  };
  return <View style={{gap:16}}>
    <Text style={{color:colors.text,fontSize:20,fontWeight:'600'}}>{copy('outings.newPlan')}</Text>
    <FormInput testID="outing-title" value={title} onChangeText={setTitle} maxLength={80} accessibilityLabel={copy('outings.planName')} editable={!model.working}/>
    <Text style={{color:colors.text}}>{copy('outings.events')}</Text>
    <FormInput testID="outing-search" value={search} onChangeText={setSearch} placeholder={copy('outings.search')} accessibilityLabel={copy('outings.search')}/>
    {selected.filter(e=>!model.events.some(option=>option.id===e.id)).map(e=><Choice key={e.id} title={e.title} selected onPress={()=>setSelected(rows=>rows.filter(row=>row.id!==e.id))}/>)}
    {model.events.map(e=><Choice key={e.id} title={e.title} hint={formatDate(e.startTime,language,true)+' · '+e.locationName} selected={selected.some(v=>v.id===e.id)} disabled={model.working||selected.length>=4&&!selected.some(v=>v.id===e.id)} onPress={()=>setSelected(rows=>rows.some(v=>v.id===e.id)?rows.filter(v=>v.id!==e.id):[...rows,e])}/>)}
    {model.moreEvents&&<ActionButton title={copy('outings.more')} tone="secondary" busy={model.catalogPending} onPress={()=>{setPage(page+1);void model.store.searchEvents(search,page+1);}}/>}
    <Text style={{color:colors.text}}>{copy('outings.friends')}</Text>
    {!model.friends.length&&!model.catalogPending&&<Text style={{color:colors.muted}}>{copy('outings.noFriends')}</Text>}
    {model.friends.map(f=><Choice key={f.id} title={f.username} selected={friends.includes(f.id)} disabled={model.working||friends.length>=7&&!friends.includes(f.id)} onPress={()=>setFriends(rows=>rows.includes(f.id)?rows.filter(id=>id!==f.id):[...rows,f.id])}/>)}
    <ActionButton testID="outing-create" title={copy('outings.create')} busy={model.working} disabled={!canCreatePlan(title,selected.map(e=>e.id),friends)} onPress={()=>void create()}/>
    <ActionButton title={copy('common.cancel')} tone="ghost" disabled={model.working} onPress={onCancel}/>
  </View>;
}
export function Choice({title,hint,selected,disabled,onPress}:{title:string;hint?:string;selected:boolean;disabled?:boolean;onPress:()=>void}) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{checked:selected,disabled}} disabled={disabled} onPress={onPress} style={{borderWidth:1,borderColor:selected?colors.accent:colors.line,borderRadius:18,padding:14,minHeight:52,flexDirection:'row',gap:12,alignItems:'center',opacity:disabled?.5:1}}>
    <View style={{flex:1,minWidth:0}}><Text style={{color:colors.text,fontWeight:'600'}}>{title}</Text>{hint&&<Text style={{color:colors.muted,fontSize:12,marginTop:4}}>{hint}</Text>}</View>{selected&&<Check size={20} color={colors.accent}/>}
  </Pressable>;
}
