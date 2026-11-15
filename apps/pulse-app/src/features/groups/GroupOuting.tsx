"use client";
import {useEffect,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {ArrowLeft,Check,MoreHorizontal,Plus,RotateCcw} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {ApiClient,type ReadableSchema} from '@packages/api-client/client';
import {outingDate} from '@packages/app-core/outings/presentation';
import {groupReadinessLabel} from '@packages/app-core/social/groups';
import {ActionButton,ActionLink,IconButton} from '@/components/ui/ActionButton';
import {ModalFrame,ModalHeader} from '@/components/ui/ModalFrame';
import {StatusNotice} from '@/components/ui/StatusNotice';
import {useCachedClientQuery} from '@/lib/useCachedClientQuery';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import {PlanTicketRecipients} from '@/features/outings/PlanTicketRecipients';
import {useOutings} from '@/features/outings/useOutings';
import {TicketPreview} from '@/components/tickets/TicketPreview';
import {formatGroupEventDateTime as formatEventDateTime} from './dateFormat';
import {useGroups} from './useGroups';
import {DecisionPoll} from './DecisionPoll';
import {EventPreview} from './EventPreview';
import {EventProposal} from './EventProposal';
import {conversationTitle,groupNightDate,outingTitle,outingContextLabel} from '@packages/app-core/social/groupPresentation';
import {ActionMenu} from './ActionMenu';
import {ProposeNight} from './GroupDialogs';
import {GroupAvatars,GroupMemberCaption} from './GroupRows';
import {pickerPath,ScrollMemory} from './GroupManagement';
import s from './groups.module.css';
export default function GroupOuting({groupId,planId}:{groupId:string;planId:string}){
 const model=useGroups(groupId),{t,i18n}=useTranslation(),router=useRouter(),params=useSearchParams(),group=model.groups.find(g=>g.id===groupId),plan=group?.outings.find(p=>p.id===planId),actor=model.user?.properties.id;
 const [panel,setPanel]=useState<'reconsider'|'edit'|null>(null),[buying,setBuying]=useState(false),[selected,setSelected]=useState(''),[confirmChoice,setConfirmChoice]=useState('');
 const [attempted,setAttempted]=useState(''),[choiceRevision,setChoiceRevision]=useState(0),[showAlternatives,setShowAlternatives]=useState(false);
 const transfers=useOutings('transfers'),tickets=useCachedClientQuery<ReadableSchema<'UserTicketResponse'>[]>(actor?'night-tickets:'+actor:null,()=>ApiClient.instance.get('/users/me/tickets',{cache:'no-store'}),[]);
 useEffect(()=>{if(group?.status!=='accepted'||plan)return;let cancelled=false;void model.store.loadPlan(groupId,planId).finally(()=>{if(!cancelled)setAttempted(groupId+':'+planId)});return()=>{cancelled=true}},[group?.status,!!plan,groupId,planId,model.store]);
 useEffect(()=>{if(plan?.members.find(m=>m.userId===actor)?.ticketState==='valid')tickets.retry()},[plan?.members.find(m=>m.userId===actor)?.ticketState,tickets.retry]);
 const back='/groups/'+groupId+(params.get('from')==='outings'?'/outings':'');
 if(!model.ready||model.loading&&!group||group?.status==='accepted'&&!plan&&attempted!==groupId+':'+planId)return <main className={s.page}><StatusNotice kind="loading" title={t('common.loading')}/></main>;
 if(!plan||!group||group.status!=='accepted'||model.revoked.includes(groupId))return <main className={s.page}><ActionLink href={back}>{t('common.back')}</ActionLink><StatusNotice kind="error" title={t(model.error??'groups.accessLost')}/></main>;
 const mine=plan.members.find(m=>m.userId===actor),owner=plan.ownerId===actor,chosen=plan.options.find(e=>e.eventId===plan.chosenEventId),completed=plan.lifecycle==='completed',cancelled=plan.lifecycle==='cancelled',closed=completed||cancelled;
 const owned=tickets.data.filter(ticket=>ticket.eventId===plan.chosenEventId&&(!ticket.assignedRecipientId||ticket.assignedRecipientId===actor)&&!transfers.transfers.some(x=>x.ticketId===ticket.id&&x.senderId===actor&&x.status==='pending')),ticket=owned.find(t=>t.id===selected);
 const incoming=transfers.transfers.find(x=>x.eventId===plan.chosenEventId&&x.recipientId===actor&&x.status==='pending'&&!x.blockedReason);
 const blocked=transfers.transfers.find(x=>x.eventId===plan.chosenEventId&&x.recipientId===actor&&x.status==='expired'&&!!x.blockedReason);
 const unavailable=!chosen?.available||['sold_out','sales_ended','unavailable','upcoming','external'].includes(chosen.ticketAvailability??'unavailable');
 const action=(type:string,payload:unknown)=>model.store.planAction(groupId,planId,type,type==='attendance'?payload:{revision:plan.revision,...(payload as object)},['attendance','availability','vote'].includes(type)?{feedback:'inline'}:undefined);
 const edit=()=>setPanel('edit');
 return <main className={`${s.page} ${s.detail}`} data-testid="group-outing"><ScrollMemory scope={actor+':'+groupId+':outing:'+planId+':'+group.joinedAt} ready/><header className={s.header}><ActionLink data-testid="group-outing-back" scroll={false} className={s.circle} tone="secondary" href={back} aria-label={t('common.back')}><ArrowLeft size={20}/></ActionLink><h1 style={{fontSize:20}}>{t('groups.viewOuting')}</h1>{owner&&!closed&&plan.chosenEventId&&<ActionMenu testId="group-outing-menu" className={s.circle} label={t('groups.outingMenu')} icon={<MoreHorizontal size={20}/>} items={[{key:'reopen',testId:'group-menu-reconsider',label:t('groups.reopen'),icon:<RotateCcw size={18}/>,onSelect:()=>setPanel('reconsider')}]}/>}</header>
 <section className={s.outingContext}><div className={s.sectionHead}><div className={s.compact}><h2>{plan.outingDate?outingTitle(plan,i18n.language):t('groups.poll')}</h2><p className={s.muted}>{outingContextLabel(plan,i18n.language)}</p></div>{owner&&!closed&&<ActionButton data-testid="group-edit-date" tone="ghost" size="compact" onClick={()=>edit()}>{t('groups.change')}</ActionButton>}</div><Link className={s.groupContext} href={'/groups/'+groupId+'/info'}><GroupAvatars group={group}/><span><strong>{conversationTitle(group,actor)}</strong><span className={s.muted} style={{display:'block'}}><GroupMemberCaption group={group}/></span></span></Link></section>
 {model.error&&<StatusNotice kind="error" title={t(model.error)} action={()=>void model.store.load(groupId)} actionLabel={t('common.retry')}/>}
 {completed&&<p className={s.state}>{t('groups.completed')}</p>}{cancelled&&<p className={s.error}>{t('groups.cancelled')}</p>}
 {chosen?<>
 <div className={s.stack}><EventPreview title={chosen.title} imageUrl={chosen.imageUrl} startTime={chosen.startTime} location={chosen.location} city={plan.city} href={'/events/'+chosen.eventId}/>
 <DecisionPoll plan={plan} group={group} actor={actor} testId="group-attendance" disabled={model.busy} onChange={answer=>action('attendance',{answer,decisionRound:plan.decisionRound})}/>
 <div data-testid="group-readiness" className={s.compact}><strong>{t('groups.summary',{confirmed:plan.confirmedCount??0,ready:plan.readyCount??0})}</strong>{plan.allConfirmedReady&&<p className={s.state}>{t(groupReadinessLabel(plan,actor))}</p>}</div>
 </div>
 <section className={s.roster} aria-label={t('groups.members',{count:plan.members.length})}>{plan.members.filter(m=>m.status==='accepted').map(member=><div className={s.rosterRow} key={member.userId}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId}/><div className={s.grow}><strong>{member.username}</strong><div className={s.rosterStatuses}><span>{t(member.attendance==='yes'?'groups.comingYes':member.attendance==='no'?'groups.comingNo':'groups.unanswered')}</span><span>{t('groups.ticket_'+(member.ticketState??'unknown'))}</span></div></div>{['valid','used'].includes(member.ticketState??'')&&<Check size={17} aria-label={t('groups.ticket_'+member.ticketState)}/>}</div>)}</section>

 <div className={s.stack} style={{gap:10}}>
 {blocked&&<p role="status" className={s.muted}>{t(blocked.blockedReason==='offline_snapshot'?'outings.v2.offlineTransferClosed':'outings.v2.eventTransferClosed')}</p>}
 {incoming?<><p className={s.muted}>{t('outings.v2.giftFrom',{name:incoming.senderName,event:chosen.title})}</p><ActionButton data-testid="group-accept-ticket" busy={transfers.working} onClick={()=>void transfers.store.respondTransfer(incoming.id,'accepted').then(ok=>{if(ok){tickets.retry();void model.store.load(groupId)}})}>{t('outings.v2.acceptTicket')}</ActionButton><ActionButton tone="ghost" onClick={()=>void transfers.store.respondTransfer(incoming.id,'declined')}>{t('outings.decline')}</ActionButton></>:plan.myPendingPayment?<ActionLink href={plan.myPendingPayment.sessionId?'/checkout/success?event_id='+chosen.eventId+'&session_id='+encodeURIComponent(plan.myPendingPayment.sessionId):'/users/me/invoices'}>{t('outings.v2.checkingPayment')}</ActionLink>:owned.length?<ActionButton data-testid="group-my-ticket" onClick={()=>setSelected(owned.find(t=>!t.isValidated)?.id??owned[0].id)}>{t('groups.myTicket')}</ActionButton>:!closed&&!unavailable?<ActionButton data-testid="group-buy" onClick={()=>setBuying(true)}>{t('groups.buy')}</ActionButton>:<ActionLink href={'/events/'+chosen.eventId}>{t('outings.viewEvent')}</ActionLink>}
 {!closed&&!unavailable&&!plan.myPendingPayment&&(!!owned.length||!!incoming)&&<ActionButton tone="secondary" onClick={()=>setBuying(true)}>{t('groups.buyMore')}</ActionButton>}
 {unavailable&&!closed&&<p className={s.muted}>{t('outings.availability.'+(chosen.ticketAvailability??'unavailable'))}</p>}
 {!!tickets.error&&<StatusNotice kind="error" title={t('groups.ticket_unknown')} action={tickets.retry} actionLabel={t('common.retry')}/>}
 {transfers.error&&<p className={s.error} role="alert">{t(transfers.error)}</p>}
 {!!plan.previousEvents?.length&&<p className={s.muted}>{t('groups.previous')}</p>}
 {!closed&&<ActionButton tone="ghost" onClick={()=>router.push(pickerPath(groupId,'outing',planId)+'&returnFrom='+encodeURIComponent(params.get('from')??'chat'))}>{t('groups.alternative')}</ActionButton>}
 {plan.options.some(option=>option.eventId!==plan.chosenEventId)&&<ActionButton tone="ghost" aria-expanded={showAlternatives} onClick={()=>setShowAlternatives(value=>!value)}>{t('groups.earlierPreferences')}</ActionButton>}
 {showAlternatives&&plan.options.filter(option=>option.eventId!==plan.chosenEventId).map(option=><div className={s.eventRow} key={option.eventId}><Link className={`${s.eventLink} ${s.grow}`} href={'/events/'+option.eventId}><strong>{option.title}</strong><p className={s.muted}>{formatEventDateTime(option.startTime)} · {option.location}</p></Link>{!closed&&(owner||option.proposedBy===actor)&&<ActionButton size="compact" tone="ghost" busy={model.busy} data-testid={'group-remove-proposal-'+option.eventId} onClick={()=>void action('remove-proposal',{eventId:option.eventId})}>{t('groups.remove')}</ActionButton>}</div>)}
 </div>
 </>:<>
 <div className={s.sectionHead}><h2>{plan.outingDate?t('groups.compareNight',{day:new Intl.DateTimeFormat(i18n.language.startsWith('ro')?'ro-RO':'en-GB',{weekday:'long',timeZone:'UTC'}).format(new Date(plan.outingDate+'T12:00:00Z'))}):t('groups.compareEvents')}</h2>{!!plan.options.length&&!closed&&plan.outingDate&&<IconButton data-testid="group-add-proposal" label={t('groups.addEvent')} onClick={()=>router.push(pickerPath(groupId,'outing',planId)+'&returnFrom='+encodeURIComponent(params.get('from')??'chat'))}><Plus size={20}/></IconButton>}</div>
 {!plan.outingDate&&<div className={s.stack}><p className={s.muted}>{t(owner?'groups.chooseNightContext':'groups.creatorChoosingNight')}</p><p className={s.muted}>{plan.candidateDates?.map(day=>groupNightDate(day.date,i18n.language)).join(' · ')}</p></div>}
 {!plan.options.length&&!closed&&plan.outingDate&&<div className={s.stack}><p className={s.muted}>{t('groups.eventsEmptyHint')}</p><ActionButton data-testid="group-empty-propose" size="compact" style={{alignSelf:'flex-start'}} onClick={()=>router.push(pickerPath(groupId,'outing',planId)+'&returnFrom='+encodeURIComponent(params.get('from')??'chat'))}>{t('groups.proposeEvent')}</ActionButton></div>}
 {plan.options.map(option=><EventProposal key={option.eventId} plan={plan} group={group} actor={actor} eventId={option.eventId} disabled={model.busy} onChange={supported=>action('vote',{eventId:option.eventId,...(supported?{answer:'yes'}:{remove:true})})} actions={<>{!closed&&(owner||option.proposedBy===actor)&&<ActionButton size="compact" tone="ghost" data-testid={'group-remove-proposal-'+option.eventId} busy={model.busy} onClick={()=>void action('remove-proposal',{eventId:option.eventId})}>{t('groups.remove')}</ActionButton>}{owner&&!closed&&<ActionButton data-testid={'group-choose-'+option.eventId} size="compact" tone="secondary" disabled={!option.available} busy={model.busy} onClick={()=>{setChoiceRevision(plan.revision??0);setConfirmChoice(option.eventId)}}>{t('groups.choose')}</ActionButton>}</>}/>)}</>}
 {panel==='edit'&&<ProposeNight group={group} model={model} plan={plan} onClose={()=>setPanel(null)} onSaved={()=>setPanel(null)}/>}
 <ModalFrame open={panel==='reconsider'||!!confirmChoice} onClose={()=>{setPanel(null);setConfirmChoice('')}} label={t(confirmChoice?'groups.choose':'groups.reopen')}><ModalHeader title={t(confirmChoice?'groups.choose':'groups.reopen')} onClose={()=>{setPanel(null);setConfirmChoice('')}}/><div className={s.modalBody}>{model.error&&<p role="alert" className={s.error}>{t(model.error)}</p>}{confirmChoice?<><strong>{plan.options.find(e=>e.eventId===confirmChoice)?.title}</strong><p className={s.muted}>{t('groups.knownDate')}</p><ActionButton data-testid="group-confirm-choice" busy={model.busy} disabled={closed} onClick={()=>void action('choose',{eventId:confirmChoice,revision:choiceRevision}).then(ok=>{if(ok)setConfirmChoice('')})}>{t('groups.choose')}</ActionButton></>:<><p className={s.muted}>{t('groups.previous')}</p><ActionButton busy={model.busy} onClick={()=>void action('reopen',{revision:plan.revision,reason:cancelled?'cancelled':'other'}).then(ok=>{if(ok)setPanel(null)})}>{t('groups.reopen')}</ActionButton></>}</div></ModalFrame>
 {buying&&actor&&<PlanTicketRecipients plan={plan} actor={actor} onClose={()=>setBuying(false)}/>}{ticket&&<TicketPreview ticket={ticket} tickets={owned} onSelect={ticket=>setSelected(ticket.id)} onClose={()=>setSelected('')}/>}
 </main>;
}
