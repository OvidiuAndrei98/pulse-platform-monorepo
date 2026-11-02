import React from 'react';
import { Share, View } from 'react-native';
import { planVoteCount, type OutingPlan } from '@packages/app-core/outings/model';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { formatDate } from '../data/events';
import { WEB_URL } from '../config';
import type { useOutings } from './useOutings';

export function PlanDetails({plan,model,onEvent}:{plan:OutingPlan;model:ReturnType<typeof useOutings>;onEvent:(id:string)=>void}) {
  const {copy,language}=usePreferences(),accepted=plan.status==='accepted',own=plan.ownerId===model.user?.id;
  return <View style={{gap:18}}>
    <Text style={{color:colors.text,fontSize:24,fontWeight:'700'}}>{plan.title}</Text>
    <Text style={{color:colors.muted}}>{copy('outings.private')} · {copy('outings.expires',{date:formatDate(plan.expiresAt,language)})}</Text>
    {!accepted&&<View style={{gap:12}}><ActionButton title={copy('outings.accept')} busy={model.working} onPress={()=>void model.store.respondPlan(plan.id,'accepted')}/><ActionButton title={copy('outings.decline')} tone="secondary" disabled={model.working} onPress={()=>void model.store.respondPlan(plan.id,'declined')}/></View>}
    {plan.members.map(m=><Text key={m.userId} style={{color:colors.muted}}>{m.username} · {copy('outings.'+m.status)}</Text>)}
    {plan.options.map(e=><View key={e.eventId} style={{borderWidth:1,borderColor:plan.chosenEventId===e.eventId?colors.accent:colors.line,borderRadius:24,padding:18,gap:10}}>
      {plan.chosenEventId===e.eventId&&<Text style={{color:colors.accent}}>{copy('outings.chosen')}</Text>}
      <Text style={{color:colors.text,fontSize:18,fontWeight:'600'}}>{e.title}</Text><Text style={{color:colors.muted}}>{formatDate(e.startTime,language,true)} · {e.location}</Text>
      {accepted&&<Text style={{color:colors.muted}}>{copy('outings.votes',{count:planVoteCount(plan,e.eventId)})}</Text>}
      {!e.available&&<Text style={{color:colors.muted}}>{copy('outings.unavailable')}</Text>}
      {accepted&&!plan.chosenEventId&&e.available&&<View style={{gap:8}}>
        <ActionButton testID={'outing-vote-'+e.eventId} title={copy('outings.vote')} tone={plan.members.find(m=>m.userId===model.user?.id)?.voteEventId===e.eventId?'primary':'secondary'} disabled={model.working} onPress={()=>void model.store.vote(plan.id,e.eventId)}/>
        {own&&<ActionButton title={copy('outings.choose')} tone="ghost" disabled={model.working} onPress={()=>void model.store.choose(plan.id,e.eventId)}/>}</View>}
      <ActionButton title={copy('outings.viewEvent')} tone="secondary" onPress={()=>onEvent(e.eventId)}/>
    </View>)}
    {plan.chosenEventId&&<Text style={{color:colors.muted}}>{copy('outings.chosenHint')}</Text>}
    <ActionButton title={copy('outings.share')} tone="secondary" onPress={()=>void Share.share({message:`${plan.title}\n${WEB_URL}/outings?plan=${plan.id}`}).catch(()=>{})}/>
    <Text style={{color:colors.muted,fontSize:12}}>{copy('outings.shareHint')}</Text>
  </View>;
}
