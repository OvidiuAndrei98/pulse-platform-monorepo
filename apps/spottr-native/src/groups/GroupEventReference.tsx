import React,{useEffect,useRef,useState} from 'react';
import {Platform,View} from 'react-native';
import type {FriendGroup,GroupMessage} from '@packages/app-core/social/groups';
import {isCanonicalGroupReference,referencedGroupOuting} from '@packages/app-core/social/groupPresentation';
import {matchesPlanningContext} from '@packages/app-core/outings/model';
import type {OutingPlan} from '@packages/app-core/outings/model';
import type {GroupsStore} from '@packages/app-core/social/groups';
import {usePreferences} from '../usePreferences';
import {Text} from '../ui/Text';
import {colors,tokens} from '../ui/theme';
import {OutingPressable} from '../outings/OutingPrimitives';
import {EventPreview} from './GroupContent';
import {AttendanceResponse,EventPreference} from './GroupOutingCard';
import {groupStyles as g} from './groupStyles';

type Props={message:GroupMessage;group:FriendGroup;actor?:string;busy:boolean;store:GroupsStore;onEvent:(id:string)=>void;onOuting:(id:string)=>void;onTickets?:(plan:OutingPlan)=>void;compact?:boolean};

/** The message key, author and time remain those of the explicit source share.
 * All active state comes from that message's outing, never a matching poster. */
export function GroupEventReference({message,group,actor,busy,store,onEvent,onOuting,onTickets,compact=false}:Props){
 const {copy}=usePreferences('copy'),event=message.event,association=message.outingId;
 const canonical=isCanonicalGroupReference(message),plan=referencedGroupOuting(message,group.outings);
 const loaded=!!association&&group.outings.some(item=>item.id===association);
 const [working,setWorking]=useState(false),pending=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{if(association&&!loaded)void store.loadPlan(group.id,association)},[association,loaded,group.id,store]);
 if(!event)return <Text style={g.muted}>{copy('groups.eventUnavailable')}</Text>;
 const option=plan?.options.find(item=>item.eventId===event.id),chosen=plan?.chosenEventId===event.id;
 const compatible=!!plan&&!!option&&option.available!==false&&matchesPlanningContext({id:event.id,title:event.title,city:event.city,startTime:event.startTime,endTime:event.endTime,locationName:event.location},plan);
 const closed=!!plan&&['completed','cancelled'].includes(plan.lifecycle??'');
 const alternative=!!plan?.chosenEventId&&!chosen;
 const available=event.status==='published'&&Date.parse(event.endTime)>Date.now();
 const reduced=compact||!!association&&(!canonical||!compatible||alternative||closed);
 const state=!association?'shared':!plan?'loading':!compatible?'unavailable':closed?'closed':alternative?'alternative':chosen?'chosen':'comparing';
 const open=()=>association?onOuting(association):onEvent(event.id);
 const propose=async()=>{
  if(pending.current||busy||association||!available)return;
  pending.current=true;setWorking(true);
  try{
   const selected=await store.createOuting(group.id,{eventId:event.id,sourceMessageId:message.id});
   if(selected&&!selected.options.some(item=>item.eventId===event.id))await store.planAction(group.id,selected.id,'proposals',{eventId:event.id,sourceMessageId:message.id,revision:selected.revision});
   // The store hydrates this reference; proposing is not a route change.
  }finally{pending.current=false;if(alive.current)setWorking(false)}
 };
 return <View testID={'group-event-reference-'+message.id} {...(Platform.OS==='web'?{dataSet:{referenceState:state,referenceMessage:message.referenceMessageId??message.id,planId:association}}:{})} style={reduced?{padding:12,borderRadius:tokens.radius.surface,backgroundColor:colors.surface}:undefined}>
  <EventPreview testID={'group-shared-preview-'+message.id} variant={reduced?'message':'media'} title={option?.title??event.title} imageUrl={option?.imageUrl??event.imageUrl} startTime={option?.startTime??event.startTime} location={option?.location??event.location} city={event.city} onPress={open}>
   {!association?<View testID={'group-event-action-'+event.id}>
    {available?<OutingPressable testID="group-create-outing" accessibilityLabel={copy('groups.proposeOuting')} accessibilityState={{disabled:busy||working,busy:working}} disabled={busy||working} onPress={()=>void propose()} style={{minHeight:44,alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:0,paddingVertical:10}}><Text style={[g.muted,{fontWeight:'600',color:colors.text}]}>{copy('groups.proposeOuting')}</Text></OutingPressable>:<Text style={g.caption}>{copy(event.status==='cancelled'?'groups.cancelled':'groups.completed')}</Text>}
   </View>:plan&&canonical&&compatible&&!closed&&!alternative&&!compact?chosen?
    <AttendanceResponse compact key={plan.id+':'+plan.decisionRound} plan={plan} group={group} actor={actor} busy={busy} onRespond={answer=>store.planAction(group.id,plan.id,'attendance',{answer,decisionRound:plan.decisionRound},{feedback:'inline'})} getError={()=>store.getSnapshot().error} onOpen={()=>onTickets?onTickets(plan):open()} testID="group-chat-response"/>:
    <EventPreference compact plan={plan} group={group} actor={actor} eventId={event.id} busy={busy} onToggle={selected=>store.planAction(group.id,plan.id,'vote',{eventId:event.id,...(selected?{answer:'yes'}:{remove:true}),revision:plan.revision},{feedback:'inline'})} getError={()=>store.getSnapshot().error} onOpen={open} testID={'group-chat-preference-'+event.id}/>:
    <Text style={g.caption}>{copy(alternative?'groups.notChosen':closed?plan?.lifecycle==='cancelled'?'groups.cancelled':'groups.completed':!compatible&&loaded?'groups.eventUnavailable':'groups.viewOuting')}</Text>}
  </EventPreview>
 </View>;
}
