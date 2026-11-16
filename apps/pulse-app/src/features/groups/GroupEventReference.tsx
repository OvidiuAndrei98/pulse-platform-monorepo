"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ChevronRight,Ticket} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {type FriendGroup,type GroupMessage,type SharedEvent} from '@packages/app-core/social/groups';
import {isCanonicalGroupReference,referencedGroupOuting} from '@packages/app-core/social/groupPresentation';
import {matchesPlanningContext} from '@packages/app-core/outings/model';
import {recipientHasPendingAccess} from '@packages/app-core/outings/experience';
import {ActionButton} from '@/components/ui/ActionButton';
import {PlanTicketRecipients} from '@/features/outings/PlanTicketRecipients';
import {DecisionPoll,EventPreference} from './DecisionPoll';
import {EventPreview} from './EventPreview';
import {useGroups} from './useGroups';
import s from './groups.module.css';

type Model=ReturnType<typeof useGroups>;
/** A shared poster becomes a reference only when the server explicitly binds
 * this message to this outing. The original message remains the React key. */
export function GroupEventReference({event,message,group,model,compact=false}:{event:SharedEvent;message?:GroupMessage;group:FriendGroup;model:Model;compact?:boolean}){
 const {t}=useTranslation(),router=useRouter(),actor=model.user?.properties.id;
 const [working,setWorking]=useState(false),submitting=useRef(false);
 const [ticketEditor,setTicketEditor]=useState(false),[buying,setBuying]=useState(false);
 const canonical=!!message&&isCanonicalGroupReference(message),plan=message?referencedGroupOuting(message,group.outings):undefined;
 const association=message?.outingId,path=association?'/groups/'+group.id+'/outings/'+association:undefined;
 const hasLoadedPlan=!!association&&group.outings.some(item=>item.id===association);
 useEffect(()=>{if(association&&!hasLoadedPlan)void model.store.loadPlan(group.id,association)},[association,hasLoadedPlan,group.id,model.store]);
 const option=plan?.options.find(item=>item.eventId===event.id),chosen=plan?.chosenEventId===event.id;
 const available=event.status==='published'&&Date.parse(event.endTime)>Date.now();
 const compatible=!!plan&&!!option&&option.available!==false&&matchesPlanningContext({id:event.id,title:event.title,city:event.city,startTime:event.startTime,endTime:event.endTime,locationName:event.location},plan);
 const closed=!!plan&&['completed','cancelled'].includes(plan.lifecycle??'');
 const alternative=!!plan?.chosenEventId&&!chosen;
 const reduced=compact||!!association&&(!canonical||!compatible||alternative||closed);
 const referenceState=!association?'shared':!plan?'loading':!compatible?'unavailable':closed?'closed':alternative?'alternative':chosen?'chosen':'comparing';
 const openTickets=()=>{if(!actor||!plan||!path)return;const member=plan.members.find(member=>member.userId===actor);if(plan.myPendingPayment||plan.myCheckoutReservation||member&&(member.hasTicket||['valid','used'].includes(member.ticketState??'')||recipientHasPendingAccess(member))){router.push(path);return}setTicketEditor(true);setBuying(true)};
 const propose=async()=>{
  if(submitting.current||model.busy||association||!available)return;
  submitting.current=true;setWorking(true);
  try{
   const selected=await model.store.createOuting(group.id,{eventId:event.id,...(message?{sourceMessageId:message.id}:{})});
   if(!selected)return;
   if(!selected.options.some(item=>item.eventId===event.id)){
    const result=await model.store.planAction(group.id,selected.id,'proposals',{eventId:event.id,sourceMessageId:message?.id,revision:selected.revision});
    if(!result)return;
   }
   // A conversation evolves in place; collections may enter the resulting outing.
   if(compact)router.push('/groups/'+group.id+'/outings/'+selected.id);
  }finally{submitting.current=false;setWorking(false)}
 };
 return <article className={s.sharedEvent+' '+s.eventReference} data-compact={reduced} data-testid="group-event-reference" data-reference-state={referenceState} data-reference-message={message?.referenceMessageId??message?.id} data-event-id={event.id} data-plan-id={association}>
  <EventPreview variant={reduced?'compact':'chat'} title={option?.title??event.title} startTime={option?.startTime??event.startTime} imageUrl={option?.imageUrl??event.imageUrl} location={option?.location??event.location} city={event.city} href={path??'/events/'+event.id}/>
  {!association?<div className={s.sharedEventAction}>{available?<ActionButton data-testid="group-create-outing" data-event-id={event.id} tone="ghost" size="compact" busy={working} disabled={model.busy} onClick={()=>void propose()}>{t('groups.proposeOuting')}</ActionButton>:<p className={s.muted}>{t(event.status==='cancelled'?'groups.cancelled':'groups.completed')}</p>}</div>:plan&&canonical&&compatible&&!closed&&!alternative&&!compact?<>
   {chosen?<DecisionPoll plan={plan} group={group} actor={actor} testId="group-message-response" disabled={model.busy} onChange={answer=>model.store.planAction(group.id,plan.id,'attendance',{answer,decisionRound:plan.decisionRound},{feedback:'inline'})} action={<ActionButton size="compact" data-testid="group-reference-tickets" onClick={openTickets}><Ticket size={15} aria-hidden/>{t('groups.ticketEntry')}</ActionButton>}/>:<div className={s.referenceChoices}><EventPreference plan={plan} group={group} actor={actor} eventId={event.id} testId={'group-preference-'+event.id} disabled={model.busy} onChange={supported=>model.store.planAction(group.id,plan.id,'vote',{eventId:event.id,revision:plan.revision,...(supported?{answer:'yes'}:{remove:true})},{feedback:'inline'})}/><Link className={s.referenceCompare} data-testid="group-reference-compare" href={path!}>{t('groups.compareShort')}<ChevronRight size={15} aria-hidden/></Link></div>}
  </>:<div className={s.referenceCaption}><span>{t(alternative?'groups.notChosen':closed?plan?.lifecycle==='cancelled'?'groups.cancelled':'groups.completed':!compatible&&hasLoadedPlan?'groups.eventUnavailable':'groups.viewOuting')}</span><Link href={path!} aria-label={t('groups.viewOuting')}><ChevronRight size={17} aria-hidden/></Link></div>}
 {ticketEditor&&actor&&plan&&<PlanTicketRecipients key={actor+':'+plan.id+':'+plan.decisionRound} plan={plan} actor={actor} open={buying} pendingCount={group.members.filter(m=>m.status==='pending').length} onClose={()=>setBuying(false)}/>}
 </article>;
}
