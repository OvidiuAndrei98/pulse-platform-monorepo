import React,{useEffect,useState} from 'react';
import { View } from 'react-native';
import { CalendarDays,MapPin,Ticket } from 'lucide-react-native';
import { feedDate } from '@packages/app-core/feed/model';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { StatusNotice } from '../ui/StatusNotice';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { PlanBuilder } from './PlanBuilder';
import { SuggestForOuting } from './SuggestForOuting';
import type { useOutings } from './useOutings';
import { o } from './outingsStyles';

export function EventOutingStart({eventId,model,onOpen,onCancel}:{eventId:string;model:ReturnType<typeof useOutings>;onOpen:(id:string)=>void;onCancel:()=>void}) {
  const {copy,language}=usePreferences(),[existing,setExisting]=useState(false),event=model.sourceEvent;
  useEffect(()=>{void model.store.loadSourceEvent(eventId);},[eventId,model.store]);
  if(model.sourceError)return <StatusNotice kind="error" title={copy(model.sourceError)} onRetry={()=>void model.store.loadSourceEvent(eventId)} retryLabel={copy('common.retry')}/>;
  if(!event||event.id!==eventId||model.sourcePending)return <StatusNotice kind="loading" title={copy('common.loading')}/>;
  return <View style={o.stack} testID="event-outing-start">
    <View style={o.section}>
      <View style={[o.row,{gap:8}]}><Ticket size={15} color={colors.muted}/><Text style={o.caption}>{copy('outings.eventStart.proposal')}</Text></View>
      <Text accessibilityRole="header" style={o.heading}>{event.title}</Text>
      <View style={[o.row,{gap:8}]}><CalendarDays size={16} color={colors.muted}/><Text style={[o.muted,{flex:1}]}>{feedDate(event,language)}</Text></View>
      <View style={[o.row,{gap:8}]}><MapPin size={16} color={colors.muted}/><Text style={[o.muted,{flex:1}]}>{event.locationName} · {event.city}</Text></View>
      <Text style={o.caption}>{copy('outings.chosenHint')}</Text>
    </View>
    <View style={{alignSelf:'flex-start'}}><ActionButton tone="secondary" testID="outing-toggle-existing" accessibilityState={{expanded:existing}} disabled={model.working} title={copy(existing?'outings.eventStart.newInstead':'outings.eventStart.addExisting')} onPress={()=>setExisting(value=>!value)}/></View>
    <View style={{display:existing?'none':'flex'}} accessibilityElementsHidden={existing} importantForAccessibility={existing?'no-hide-descendants':'auto'}><PlanBuilder key={event.id} model={model} sourceEvent={event} onCreated={onOpen} onCancel={onCancel}/></View>
    {existing&&<SuggestForOuting event={event} model={model} onProposed={onOpen}/>}
  </View>;
}
