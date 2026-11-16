"use client";
import {useEffect,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {ArrowLeft,Check,MoreHorizontal,Plus,RotateCcw} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {ApiClient,type ReadableSchema} from '@packages/api-client/client';
import {groupTicketReadiness} from '@packages/app-core/social/groups';
import {ActionButton,ActionLink} from '@/components/ui/ActionButton';
import {StatusNotice} from '@/components/ui/StatusNotice';
import {useCachedClientQuery} from '@/lib/useCachedClientQuery';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import {PlanTicketRecipients} from '@/features/outings/PlanTicketRecipients';
import {CheckoutReservationRecovery} from '@/features/outings/CheckoutReservationRecovery';
import {useOutings} from '@/features/outings/useOutings';
import {TicketPreview} from '@/components/tickets/TicketPreview';
import {useGroups} from './useGroups';
import {DecisionPoll} from './DecisionPoll';
import {EventPreview} from './EventPreview';
import {EventProposal} from './EventProposal';
import {OutingAudit} from './GroupAudit';
import {groupNightDate} from '@packages/app-core/social/groupPresentation';
import {ActionMenu} from './ActionMenu';
import {ProposeNight} from './GroupDialogs';
import {GroupSheet,GroupPageFooter} from './GroupSheet';
import {pickerPath,ScrollMemory} from './GroupManagement';
import s from './groups.module.css';
export default function GroupOuting({groupId,planId}:{groupId:string;planId:string}){
 const model=useGroups(groupId),{t,i18n}=useTranslation(),router=useRouter(),params=useSearchParams(),group=model.groups.find(g=>g.id===groupId),plan=group?.outings.find(p=>p.id===planId),actor=model.user?.properties.id;
 const [panel,setPanel]=useState<'reconsider'|'edit'|'destination'|null>(null),[buying,setBuying]=useState(false),[ticketEditor,setTicketEditor]=useState(false),[selected,setSelected]=useState(''),[confirmChoice,setConfirmChoice]=useState('');
 const openTickets=()=>{setTicketEditor(true);setBuying(true)};
 const [attempted,setAttempted]=useState(''),[choiceRevision,setChoiceRevision]=useState(0),[showAlternatives,setShowAlternatives]=useState(false);
 const transfers=useOutings('transfers'),tickets=useCachedClientQuery<ReadableSchema<'UserTicketResponse'>[]>(actor?'night-tickets:'+actor:null,()=>ApiClient.instance.get('/users/me/tickets',{cache:'no-store'}),[]);
 useEffect(()=>{if(group?.status!=='accepted'||plan)return;let cancelled=false;void model.store.loadPlan(groupId,planId).finally(()=>{if(!cancelled)setAttempted(groupId+':'+planId)});return()=>{cancelled=true}},[group?.status,!!plan,groupId,planId,model.store]);
 useEffect(()=>{if(plan?.members.find(m=>m.userId===actor)?.ticketState==='valid')tickets.retry()},[plan?.members.find(m=>m.userId===actor)?.ticketState,tickets.retry]);
 const historicalId=params.get('history');
 useEffect(()=>{if(historicalId&&group?.status==='accepted')void model.store.loadMessages(groupId)},[historicalId,group?.status,groupId,model.store]);
 const back='/groups/'+groupId+(params.get('from')==='outings'?'/outings?from='+(params.get('origin')==='chat'?'chat':'info'):''),path='/groups/'+groupId+'/outings/'+planId;
 if(!model.ready||model.loading&&!group||group?.status==='accepted'&&!plan&&attempted!==groupId+':'+planId)return <main className={s.page}><StatusNotice kind="loading" title={t('common.loading')}/></main>;
 if(!plan||!group||group.status!=='accepted'||model.revoked.includes(groupId))return <main className={s.page}><ActionLink href={back}>{t('common.back')}</ActionLink><StatusNotice kind="error" title={t(model.error??'groups.accessLost')}/></main>;
 const owner=plan.ownerId===actor,chosen=plan.options.find(e=>e.eventId===plan.chosenEventId),completed=plan.lifecycle==='completed',cancelled=plan.lifecycle==='cancelled',closed=completed||cancelled;
 const owned=tickets.data.filter(ticket=>ticket.eventId===plan.chosenEventId&&(!ticket.assignedRecipientId||ticket.assignedRecipientId===actor)&&!transfers.transfers.some(x=>x.ticketId===ticket.id&&x.senderId===actor&&x.status==='pending')),ticket=owned.find(t=>t.id===selected);
 const incoming=transfers.transfers.find(x=>x.eventId===plan.chosenEventId&&x.recipientId===actor&&x.status==='pending'&&!x.blockedReason);
 const blocked=transfers.transfers.find(x=>x.eventId===plan.chosenEventId&&x.recipientId===actor&&x.status==='expired'&&!!x.blockedReason);
 const unavailable=!!chosen&&(!chosen.available||['sold_out','sales_ended','unavailable','upcoming','external'].includes(chosen.ticketAvailability??''));
 const action=(type:string,payload:unknown)=>model.store.planAction(groupId,planId,type,type==='attendance'?payload:{revision:plan.revision,...(payload as object)},['attendance','vote'].includes(type)?{feedback:'inline'}:undefined);
 const readiness=groupTicketReadiness(plan,actor,model.loading?'loading':model.error?'error':'ready'),destination=plan.options.find(event=>event.eventId===confirmChoice);
 const add=()=>router.push(pickerPath(groupId,'outing',planId)+'&returnFrom='+encodeURIComponent(params.get('from')??'chat'));
 const removal=(option:typeof plan.options[number])=>!closed&&(owner||option.proposedBy===actor)?<ActionMenu testId={'group-proposal-menu-'+option.eventId} label={t('groups.outingMenu')} icon={<MoreHorizontal size={19}/>} items={[{key:'remove',testId:'group-remove-proposal-'+option.eventId,label:t('groups.remove'),destructive:true,disabled:model.busy,onSelect:()=>void action('remove-proposal',{eventId:option.eventId})}]}/>:undefined;
 const header=<header className={s.header}><ActionLink data-testid="group-outing-back" scroll={false} className={s.circle} tone="secondary" href={back} aria-label={t('common.back')}><ArrowLeft size={20}/></ActionLink><h1 style={{fontSize:20}}>{t('groups.outingTitleLabel')}</h1>{owner&&!closed&&chosen&&!historicalId&&<ActionMenu testId="group-outing-menu" className={s.circle} label={t('groups.outingMenu')} icon={<MoreHorizontal size={20}/>} items={[{key:'reopen',testId:'group-menu-reconsider',label:t('groups.reopen'),icon:<RotateCcw size={18}/>,onSelect:()=>setPanel('reconsider')}]}/>}</header>;
 if(historicalId){const snapshot=model.messages[groupId]?.find(message=>message.id===historicalId)?.outingContext,event=plan.options.find(option=>option.eventId===snapshot?.chosenEventId);return <main className={s.page} data-testid="group-outing-history-detail">{header}<h2>{t('groups.earlierOuting')}</h2>{snapshot&&<p className={s.muted}>{[groupNightDate(snapshot.outingDate??'',i18n.language),snapshot.city].filter(Boolean).join(' · ')}</p>}{event&&<EventPreview title={event.title} startTime={event.startTime} imageUrl={event.imageUrl} location={event.location} href={'/events/'+event.eventId}/>}<p className={s.muted}>{t('groups.earlierOutingHint')}</p>{!snapshot&&model.more[groupId]&&<ActionButton tone="ghost" onClick={()=>void model.store.loadMessages(groupId,true)}>{t('groups.older')}</ActionButton>}<OutingAudit expanded messages={model.messages[groupId]??[]} groupId={groupId} planId={planId} more={model.more[groupId]} onLoad={older=>void model.store.loadMessages(groupId,older)}/><ActionLink href={path}>{t('groups.viewOuting')}</ActionLink></main>}
 return <main className={s.page+' '+s.detail} data-testid="group-outing"><ScrollMemory scope={actor+':'+groupId+':outing:'+planId+':'+group.joinedAt} ready/>{header}
 <section className={s.outingContext}><p>{[groupNightDate(plan.outingDate??'',i18n.language),plan.city].filter(Boolean).join(' · ')}</p>{owner&&!closed&&<ActionButton data-testid="group-edit-date" tone="ghost" size="compact" onClick={()=>setPanel('edit')}>{t('groups.change')}</ActionButton>}</section>
 {model.error&&<StatusNotice kind="error" title={t(model.error)} action={()=>void model.store.load(groupId)} actionLabel={t('common.retry')}/>}
 {completed&&<p className={s.state}>{t('groups.completed')}</p>}{cancelled&&<p className={s.error}>{t('groups.cancelled')}</p>}
 {chosen?<>
  <EventPreview variant="cover" title={chosen.title} imageUrl={chosen.imageUrl} startTime={chosen.startTime} location={chosen.location} city={plan.city} href={'/events/'+chosen.eventId}/>
  <DecisionPoll plan={plan} group={group} actor={actor} testId="group-attendance" disabled={model.busy} onChange={answer=>action('attendance',{answer,decisionRound:plan.decisionRound})}/>
  <section className={s.roster} aria-label={t('groups.participants')}><div className={s.participantHeading}><h2>{t('groups.participants')}</h2><p data-testid="group-readiness" className={s.muted}>{t(readiness.summaryKey,readiness.values)}</p>{!readiness.complete&&<ActionButton tone="ghost" size="compact" style={{alignSelf:'flex-start'}} onClick={()=>void model.store.loadPlan(groupId,planId)}>{t('common.retry')}</ActionButton>}</div>{plan.members.filter(m=>m.status==='accepted').map(member=><div className={s.rosterRow} key={member.userId}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId}/><div className={s.grow}><strong>{member.username}</strong><div className={s.rosterStatuses}><span>{t(member.attendance==='yes'?'groups.comingYes':member.attendance==='no'?'groups.comingNo':'groups.unanswered')}</span><span>{t('groups.ticket_'+(member.ticketState??(member.hasTicket===true?'valid':member.hasTicket===false?'none':'unknown')))}</span></div></div>{['valid','used'].includes(member.ticketState??'')&&<Check size={17} aria-label={t('groups.ticket_'+member.ticketState)}/>}</div>)}</section>
  {tickets.data.some(ticket=>plan.previousEvents?.some(event=>event.eventId===ticket.eventId)&&(!ticket.assignedRecipientId||ticket.assignedRecipientId===actor))&&<p className={s.muted}>{t('groups.previous')}</p>}
  <div className={s.sectionHead}>{!closed&&<ActionButton tone="ghost" size="compact" onClick={add}><Plus size={16}/>{t('groups.alternative')}</ActionButton>}{plan.options.some(option=>option.eventId!==plan.chosenEventId)&&<ActionButton tone="ghost" size="compact" aria-expanded={showAlternatives} onClick={()=>setShowAlternatives(value=>!value)}>{t('groups.earlierPreferences')}</ActionButton>}</div>
  {showAlternatives&&plan.options.filter(option=>option.eventId!==plan.chosenEventId).map(option=><EventPreview key={option.eventId} title={option.title} imageUrl={option.imageUrl} startTime={option.startTime} location={option.location} href={'/events/'+option.eventId} action={removal(option)}/>)}
  <GroupPageFooter>
   {blocked&&<p role="status" className={s.muted}>{t(blocked.blockedReason==='offline_snapshot'?'outings.v2.offlineTransferClosed':'outings.v2.eventTransferClosed')}</p>}
   {incoming?<><p className={s.muted}>{t('outings.v2.giftFrom',{name:incoming.senderName,event:chosen.title})}</p><ActionButton data-testid="group-accept-ticket" busy={transfers.working} onClick={()=>void transfers.store.respondTransfer(incoming.id,'accepted').then(ok=>{if(ok){tickets.retry();void model.store.load(groupId)}})}>{t('outings.v2.acceptTicket')}</ActionButton><ActionButton tone="ghost" onClick={()=>void transfers.store.respondTransfer(incoming.id,'declined')}>{t('outings.decline')}</ActionButton></>:plan.myPendingPayment?<ActionLink href={plan.myPendingPayment.sessionId?'/checkout/success?event_id='+chosen.eventId+'&session_id='+encodeURIComponent(plan.myPendingPayment.sessionId):'/users/me/invoices'}>{t('outings.v2.checkingPayment')}</ActionLink>:plan.myCheckoutReservation?<CheckoutReservationRecovery {...plan.myCheckoutReservation} eventId={chosen.eventId} onResolved={async()=>{await model.store.loadPlan(groupId,planId);await tickets.retry();await transfers.store.load()}}/>:owned.length?null:!closed&&!unavailable?<ActionButton data-testid="group-buy" onClick={openTickets}>{t('groups.buy')}</ActionButton>:<ActionLink href={'/events/'+chosen.eventId}>{t('outings.viewEvent')}</ActionLink>}
   {!!owned.length&&<ActionButton data-testid="group-my-ticket" tone={incoming||plan.myPendingPayment||plan.myCheckoutReservation?"secondary":"primary"} onClick={()=>setSelected(owned.find(ticket=>!ticket.isValidated)?.id??owned[0].id)}>{t('groups.myTicket')}</ActionButton>}
   {!closed&&!unavailable&&!plan.myPendingPayment&&!plan.myCheckoutReservation&&(!!owned.length||!!incoming)&&<ActionButton data-testid="group-buy-more" tone="secondary" onClick={openTickets}>{t('groups.buyMore')}</ActionButton>}
   {unavailable&&!closed&&<p className={s.muted}>{t('outings.availability.'+(chosen.ticketAvailability??'unavailable'))}</p>}
   {!!tickets.error&&<ActionButton tone="ghost" onClick={tickets.retry}>{t('groups.ticket_unknown')} · {t('common.retry')}</ActionButton>}{transfers.error&&<p className={s.error} role="alert">{t(transfers.error)}</p>}
  </GroupPageFooter>
 </>:<>
  <div className={s.sectionHead}><h2>{t('groups.proposalsTitle')}</h2>{!closed&&plan.outingDate&&<ActionButton data-testid="group-add-proposal" tone="ghost" size="compact" onClick={add}><Plus size={17}/>{t('groups.addShort')}</ActionButton>}</div>
  {!plan.outingDate?<div className={s.stack}><p className={s.muted}>{t(owner?'groups.chooseNightContext':'groups.creatorChoosingNight')}</p><p className={s.muted}>{plan.candidateDates?.map(day=>groupNightDate(day.date,i18n.language)).join(' · ')}</p></div>:!plan.options.length?<p className={s.muted}>{t('groups.eventsEmptyHint')}</p>:<p className={s.muted}>{t('groups.multipleChoicesHint')}</p>}
  {plan.options.map(option=><EventProposal key={option.eventId} plan={plan} group={group} actor={actor} eventId={option.eventId} disabled={model.busy} onChange={supported=>action('vote',{eventId:option.eventId,...(supported?{answer:'yes'}:{remove:true})})} actions={removal(option)}/>)}
  {owner&&!closed&&plan.options.length>0&&<GroupPageFooter><ActionButton data-testid="group-choose-destination" disabled={!plan.options.some(option=>option.available)} onClick={()=>{setChoiceRevision(plan.revision??0);setConfirmChoice('');setPanel('destination')}}>{t('groups.chooseDestination')}</ActionButton></GroupPageFooter>}
 </>}
 <OutingAudit messages={model.messages[groupId]??[]} groupId={groupId} planId={planId} more={model.more[groupId]} onLoad={older=>void model.store.loadMessages(groupId,older)}/>
 {panel==='edit'&&<ProposeNight group={group} model={model} plan={plan} onClose={()=>setPanel(null)} onSaved={()=>setPanel(null)}/>}
 {panel==='destination'&&<GroupSheet title={t('groups.chooseDestination')} testId="group-destination-sheet" busy={model.busy} onClose={()=>setPanel(null)} footer={<ActionButton data-testid="group-confirm-choice" busy={model.busy} disabled={closed||!destination?.available} onClick={()=>void action('choose',{eventId:confirmChoice,revision:choiceRevision}).then(ok=>{if(ok){setPanel(null);setConfirmChoice('')}})}>{t('groups.confirmDestination')}</ActionButton>}>
  <p className={s.muted}>{t('groups.destinationHint')}</p><div role="radiogroup" aria-label={t('groups.chooseDestination')}>{plan.options.map(option=><label className={s.destinationChoice} key={option.eventId}><input data-testid={'group-destination-'+option.eventId} type="radio" name="destination" checked={confirmChoice===option.eventId} disabled={!option.available||model.busy} onChange={()=>setConfirmChoice(option.eventId)}/><EventPreview title={option.title} startTime={option.startTime} imageUrl={option.imageUrl} location={option.location}/></label>)}</div>{model.error&&<p role="alert" className={s.error}>{t(model.error)}</p>}
 </GroupSheet>}
 {panel==='reconsider'&&<GroupSheet title={t('groups.reopen')} onClose={()=>setPanel(null)} busy={model.busy} footer={<ActionButton busy={model.busy} onClick={()=>void action('reopen',{revision:plan.revision,reason:cancelled?'cancelled':'other'}).then(ok=>{if(ok)setPanel(null)})}>{t('groups.reopen')}</ActionButton>}><p className={s.muted}>{t('groups.previous')}</p>{model.error&&<p role="alert" className={s.error}>{t(model.error)}</p>}</GroupSheet>}
 {ticketEditor&&actor&&<PlanTicketRecipients key={actor+':'+plan.id+':'+plan.decisionRound} open={buying} plan={plan} actor={actor} pendingCount={group.members.filter(m=>m.status==='pending').length} onClose={()=>setBuying(false)}/>}{ticket&&<TicketPreview ticket={ticket} tickets={owned} onSelect={ticket=>setSelected(ticket.id)} onClose={()=>setSelected('')}/>}
 </main>;
}
