import React,{useEffect,useState} from 'react';
import { View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { arrivalStates,planNightEnded } from '@packages/app-core/outings/presentation';
import { eventNightTickets,type OutingPlan } from '@packages/app-core/outings/model';
import { usePreferences } from '../usePreferences';
import { useTickets } from '../data/useTickets';
import { TicketSheet } from '../profile/TicketSheet';
import { EventImage } from '../ui/common';
import { Text } from '../ui/Text';
import { OutingAction as ActionButton } from './OutingPrimitives';
import { AppModal } from '../ui/AppModal';
import { FormInput } from '../ui/FormInput';
import { DashboardDropdown } from '../dashboard/DashboardDropdown';
import { DateTimeField } from '../dashboard/DateTimeField';
import { formatDate } from '../data/events';
import { o } from './outingsStyles';
import { j } from './journeyStyles';
import type { useOutings } from './useOutings';

export function PlanReady({plan,model,onEvent,onNight}:{plan:OutingPlan;model:ReturnType<typeof useOutings>;onEvent:(id:string)=>void;onNight:(id:string)=>void}) {
 const {copy,language}=usePreferences(),focused=useIsFocused(),tickets=useTickets(focused,true),owned=eventNightTickets(tickets.data??[],plan.chosenEventId!);
 const [meetingEdit,setMeetingEdit]=useState(false);
 const [selected,setSelected]=useState(''),[planB,setPlanB]=useState(false),[reason,setReason]=useState('sold_out');
 const [place,setPlace]=useState(plan.meetingPoint??''),[meeting,setMeeting]=useState(plan.meetingAt??'');
 useEffect(()=>{setPlace(plan.meetingPoint??'');setMeeting(plan.meetingAt??'');},[plan.meetingPoint,plan.meetingAt]);
 const event=plan.options.find(e=>e.eventId===plan.chosenEventId),mine=plan.members.find(m=>m.userId===model.user?.id),owner=plan.ownerId===model.user?.id;
 const ended=planNightEnded(plan);
 return <View style={o.stack}>
  <View style={j.card}>
   {!!event?.imageUrl&&<EventImage uri={event.imageUrl} style={{width:'100%',height:180,borderRadius:18}}/>}
   <Text style={o.caption}>{copy('outings.plan.ready')}</Text><Text style={[o.title,{fontSize:26}]}>{event?.title}</Text>
   <Text style={o.muted}>{event?.location} · {event&&formatDate(event.startTime,language,true)}</Text>
   {ended?<ActionButton title={copy('outings.viewEvent')} onPress={()=>onEvent(plan.chosenEventId!)}/>:mine?.hasTicket?<ActionButton title={copy('outings.plan.ticket')} busy={tickets.isPending} disabled={!owned.length} onPress={()=>setSelected(owned.find(t=>!t.isValidated)?.id??owned[0]!.id)}/>:<ActionButton title={copy('outings.buyTicket')} onPress={()=>onEvent(plan.chosenEventId!)}/>}
   {tickets.isError&&<ActionButton title={copy('common.retry')} tone="secondary" onPress={()=>void tickets.refetch()}/>}
   <ActionButton title={copy('outings.plan.night')} tone="secondary" onPress={()=>onNight(plan.chosenEventId!)}/>
   <Text style={o.caption}>{copy('outings.plan.ticketHint')}</Text>
  </View>
  <View style={j.card}><Text style={o.heading}>{copy('outings.plan.meetup')}</Text>
   <Text style={o.body}>{plan.meetingPoint||copy('outings.plan.noMeeting')}</Text>{plan.meetingAt&&<Text style={o.muted}>{formatDate(plan.meetingAt,language,true)}</Text>}
   {owner&&!ended&&<ActionButton title={copy('outings.plan.edit')} tone="ghost" onPress={()=>setMeetingEdit(true)}/>}

  </View>
  <View style={j.card}><DashboardDropdown testID="outing-arrival" label={copy('outings.plan.myStatus')} placeholder={copy('outings.plan.not_set')} value={mine?.arrivalStatus??'not_set'} options={arrivalStates.map(value=>({value,label:copy('outings.plan.'+value)}))} disabled={model.working||ended} onChange={status=>void model.store.updatePlan(plan.id,'arrival',{status})}/><Text style={o.caption}>{copy('outings.plan.statusHint')}</Text></View>
  {owner&&<ActionButton title={copy('outings.plan.planB')} tone="secondary" disabled={model.working} onPress={()=>setPlanB(true)}/>}
  <AppModal open={meetingEdit} title={copy('outings.plan.meetup')} onClose={()=>setMeetingEdit(false)} dismissible={!model.working} footer={<ActionButton title={copy('outings.plan.saveMeeting')} busy={model.working} onPress={()=>void model.store.updatePlan(plan.id,'meeting',{place,at:meeting||undefined}).then(ok=>{if(ok)setMeetingEdit(false);})}/>}><View style={j.section}><FormInput testID="outing-meeting" accessibilityLabel={copy('outings.plan.place')} placeholder={copy('outings.plan.place')} maxLength={160} value={place} onChangeText={setPlace}/><DateTimeField label={copy('outings.plan.meetingTime')} value={meeting} onChange={value=>setMeeting(new Date(value).toISOString())}/></View></AppModal>
  <AppModal open={planB} title={copy('outings.plan.planB')} dismissible={!model.working} onClose={()=>setPlanB(false)} footer={<><ActionButton title={copy('common.cancel')} tone="secondary" disabled={model.working} onPress={()=>setPlanB(false)}/><ActionButton title={copy('outings.plan.reopen')} busy={model.working} onPress={()=>void model.store.updatePlan(plan.id,'reopen',{revision:plan.revision,reason}).then(ok=>{if(ok)setPlanB(false);})}/></>}>
   <View style={{gap:16}}><Text style={o.body}>{copy('outings.plan.planBHint')}</Text><DashboardDropdown label={copy('outings.plan.planB')} placeholder={copy('outings.plan.other')} value={reason} onChange={setReason} options={['sold_out','cancelled','other'].map(value=>({value,label:copy('outings.plan.'+value)}))}/></View>
  </AppModal>
  {!!selected&&owned.some(t=>t.id===selected)&&<TicketSheet tickets={owned} initialId={selected} onClose={()=>setSelected('')}/>}
 </View>;
}
