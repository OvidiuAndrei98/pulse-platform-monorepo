import React from 'react';
import { Share, View } from 'react-native';
import { planVoteCount, type OutingPlan } from '@packages/app-core/outings/model';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { formatDate } from '../data/events';
import { WEB_URL } from '../config';
import { PlanProposals } from './PlanProposals';
import type { useOutings } from './useOutings';

export function PlanDetails({plan,model,onEvent,onNight,onGroup}:{
  plan:OutingPlan;model:ReturnType<typeof useOutings>;
  onEvent:(id:string)=>void;onNight:(id:string)=>void;onGroup:(id:string)=>void;
}) {
  const {copy,language}=usePreferences(),accepted=plan.status==='accepted',own=plan.ownerId===model.user?.id;
  const mine=plan.members.find(member=>member.userId===model.user?.id);
  const amount=(value:number)=>new Intl.NumberFormat(language==='ro'?'ro-RO':'en-GB',{maximumFractionDigits:2}).format(value);
  return <View style={{gap:18}}>
    <Text style={{color:colors.text,fontSize:24,fontWeight:'700'}}>{plan.title}</Text>
    <Text style={{color:colors.muted}}>{[plan.outingDate,plan.city].filter(Boolean).join(' · ')}</Text>
    <Text style={{color:colors.muted,fontSize:12}}>{copy('outings.private')} · {copy('outings.expires',{date:formatDate(plan.expiresAt,language)})}</Text>
    {!accepted?<View style={{gap:12}}>
      <ActionButton title={copy('outings.accept')} busy={model.working} onPress={()=>void model.store.respondPlan(plan.id,'accepted')}/>
      <ActionButton title={copy('outings.decline')} tone="secondary" disabled={model.working} onPress={()=>void model.store.respondPlan(plan.id,'declined')}/>
    </View>:<>
      {plan.members.map(member=><Text key={member.userId} style={{color:colors.muted}}>{member.username} · {copy('outings.'+member.status)}</Text>)}
      <Text style={{color:colors.text,fontSize:20,fontWeight:'600'}}>{copy('outings.events')}</Text>
      {!plan.options.length&&<Text style={{color:colors.muted}}>{copy('outings.noProposals')}</Text>}
      {plan.options.map(event=><View key={event.eventId} style={{borderWidth:1,borderColor:plan.chosenEventId===event.eventId?colors.accent:colors.line,borderRadius:24,padding:18,gap:10}}>
        {plan.chosenEventId===event.eventId&&<Text style={{color:colors.accent}}>{copy('outings.chosen')}</Text>}
        <Text style={{color:colors.text,fontSize:18,fontWeight:'600'}}>{event.title}</Text>
        <Text style={{color:colors.muted}}>{formatDate(event.startTime,language,true)} · {event.location}</Text>
        {event.priceRon!==undefined&&event.ticketAvailability!=='external'&&<Text style={{color:colors.text}}>{event.priceRon===0?copy('outings.free'):copy('outings.priceFrom',{amount:amount(event.priceRon)})}</Text>}
        {event.ticketAvailability&&<Text style={{color:colors.muted}}>{copy('outings.availability.'+event.ticketAvailability)}</Text>}
        <Text style={{color:colors.muted}}>{copy('outings.votes',{count:planVoteCount(plan,event.eventId)})}</Text>
        {!event.available&&<Text style={{color:colors.muted}}>{copy('outings.unavailable')}</Text>}
        {!plan.chosenEventId&&event.available&&<View style={{gap:8}}>
          <ActionButton testID={'outing-vote-'+event.eventId} title={copy('outings.vote')} tone={mine?.voteEventId===event.eventId?'primary':'secondary'} disabled={model.working} onPress={()=>void model.store.vote(plan.id,event.eventId)}/>
          {own&&<ActionButton title={copy('outings.choose')} tone="ghost" disabled={model.working} onPress={()=>void model.store.choose(plan.id,event.eventId)}/>}
        </View>}
        <ActionButton title={copy('outings.viewEvent')} tone="secondary" onPress={()=>onEvent(event.eventId)}/>
      </View>)}
      {!plan.chosenEventId&&(plan.outingDate&&plan.city?<PlanProposals plan={plan} model={model}/>:<Text style={{color:colors.muted}}>{copy('outings.legacyContext')}</Text>)}
      {plan.chosenEventId&&<View style={{gap:12}}>
        <Text style={{color:colors.text,fontSize:20,fontWeight:'600'}}>{copy('outings.ticketsReady')}</Text>
        {plan.members.filter(member=>member.status==='accepted').map(member=><Text key={member.userId} style={{color:colors.muted}}>{member.username} · {copy(member.hasTicket?'outings.hasTicket':'outings.needsTicket')}</Text>)}
        <Text style={{color:colors.muted,fontSize:12}}>{copy('outings.ticketPrivacy')}</Text>
        <Text style={{color:colors.muted}}>{copy('outings.chosenHint')}</Text>
        {mine?.hasTicket?<>
          <ActionButton title={copy('outings.night')} onPress={()=>onNight(plan.chosenEventId!)}/>
          <ActionButton title={copy('outings.openGroup')} tone="secondary" onPress={()=>onGroup(plan.chosenEventId!)}/>
        </>:<ActionButton title={copy('outings.buyTicket')} onPress={()=>onEvent(plan.chosenEventId!)}/>}
      </View>}
    </>}
    <ActionButton title={copy('outings.share')} tone="secondary" onPress={()=>void Share.share({message:plan.title+'\n'+WEB_URL+'/outings?plan='+plan.id}).catch(()=>{})}/>
    <Text style={{color:colors.muted,fontSize:12}}>{copy('outings.shareHint')}</Text>
  </View>;
}
