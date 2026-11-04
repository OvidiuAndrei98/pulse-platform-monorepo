import React,{useEffect,useState} from 'react';
import { ActivityIndicator,View } from 'react-native';
import { Check,Plus } from 'lucide-react-native';
import { matchesPlanningContext,type OutingPlan } from '@packages/app-core/outings/model';
import { outingDate } from '@packages/app-core/outings/presentation';
import { FormInput } from '../ui/FormInput';
import { OutingAction as ActionButton } from './OutingPrimitives';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { o } from './outingsStyles';
import { j } from './journeyStyles';
import type { useOutings } from './useOutings';

export function PlanProposals({plan,model,onProposed}:{plan:OutingPlan;model:ReturnType<typeof useOutings>;onProposed?:()=>void}) {
  const {copy,language}=usePreferences(),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  useEffect(()=>{const timer=setTimeout(()=>{setPage(1);void model.store.searchEvents(search,1,plan);},250);return()=>clearTimeout(timer);},[search,model.store,plan.id,plan.outingDate,plan.city]);
  const events=model.events.filter(event=>matchesPlanningContext(event,plan));
  return <View style={o.section}>
    <View style={{gap:8}}><Text style={o.heading}>{copy('outings.propose')}</Text><Text style={o.muted}>{copy('outings.proposeHint')}</Text></View>
    <FormInput variant="bare" style={j.input} testID="outing-search" accessibilityLabel={copy('outings.search')} placeholder={copy('outings.search')} value={search} onChangeText={setSearch}/>
    {events.map(event=>{const added=plan.options.some(option=>option.eventId===event.id);return <View key={event.id} style={[o.friend,{justifyContent:'space-between'}]}>
      <View style={{flex:1,minWidth:0,gap:4}}><Text style={o.label}>{event.title}</Text><Text style={o.caption}>{outingDate(plan.outingDate,language)} · {event.locationName}</Text></View>
      <ActionButton testID={'outing-propose-'+event.id} accessibilityLabel={copy(added?'outings.ui.proposed':'outings.ui.add')+': '+event.title} tone="secondary" style={{width:44,paddingHorizontal:10}}
        icon={added?<Check size={18}/>:<Plus size={18}/>} disabled={model.working||plan.options.length>=8||added}
        onPress={()=>void model.store.propose(plan.id,event.id).then(result=>{if(result)onProposed?.();})}/>
    </View>;})}
    {model.catalogPending&&<ActivityIndicator accessibilityLabel={copy('outings.ui.searchLoading')} color={colors.accent}/>}
    {!model.catalogPending&&!events.length&&<Text style={o.muted}>{copy('outings.ui.searchEmpty')}</Text>}
    {model.moreEvents&&<ActionButton title={copy('outings.more')} tone="ghost" busy={model.catalogPending} onPress={()=>{setPage(page+1);void model.store.searchEvents(search,page+1,plan);}}/>}
  </View>;
}
