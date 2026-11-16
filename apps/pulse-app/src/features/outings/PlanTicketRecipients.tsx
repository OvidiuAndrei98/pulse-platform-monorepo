"use client";
import {useState,useEffect,useRef,useLayoutEffect,useCallback} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslation} from 'react-i18next';
import {ApiClient} from '@packages/api-client/client';
import {parsePlans,type OutingPlan,type PlanFriend} from '@packages/app-core/outings/model';
import {eligiblePlanRecipients,recipientHasPendingAccess,outingCheckoutRecovery,type OutingCheckoutRecovery} from '@packages/app-core/outings/experience';
import {groupTicketLabel} from '@packages/app-core/social/groups';
import {Check,ChevronRight,Ticket} from 'lucide-react';
import {getTicketAvailability,getRemainingTicketCapacity} from '@packages/app-core/checkout/ticketAvailability';
import {checkoutTotals} from '@packages/app-core/checkout/totals';
import {formatRon} from '@packages/app-core/events/serviceFee';
import type {Event} from '@/core/DataProvider';
import {useDataProvider} from '@/core/DataProviderContext';
import {useCachedClientQuery} from '@/lib/useCachedClientQuery';
import {GroupSheet} from '@/features/groups/GroupSheet';
import gs from '@/features/groups/groups.module.css';
import {ActionButton} from '@/components/ui/ActionButton';
import {EventPreview} from '@/features/groups/EventPreview';
import {TicketCheckoutDrawer} from '@/features/checkout/TicketCheckoutDrawer';
import {MemberAvatar} from './OutingPrimitives';
import {CheckoutReservationRecovery} from './CheckoutReservationRecovery';
import s from './outings.module.css';

type Props={plan?:OutingPlan;eventId?:string;actor:string;onClose:()=>void;friendsOnly?:boolean;open?:boolean;pendingCount?:number};
export function PlanTicketRecipients({plan:sourcePlan,eventId,actor,onClose,friendsOnly=false,open=true,pendingCount=0}:Props){
 const {t}=useTranslation(),auth=useDataProvider(),router=useRouter(),[reviewedPlan,setReviewedPlan]=useState<OutingPlan>(),[recovery,setRecovery]=useState<OutingCheckoutRecovery>(),plan=reviewedPlan??sourcePlan,id=plan?.chosenEventId??eventId??'';
 useEffect(()=>setReviewedPlan(undefined),[sourcePlan?.id,sourcePlan?.revision,sourcePlan?.decisionRound]);
 const query=useCachedClientQuery<Event|null>(open?'plan-purchase:'+actor+':'+id:null,()=>ApiClient.instance.get('/events/{id}',{params:{path:{id}},cache:'no-store'}),null);
 const people=useCachedClientQuery<PlanFriend[]>(plan||!open?null:'gift-friends:'+actor,()=>ApiClient.instance.get('/friends',{cache:'no-store'}),[]);
 const event=query.data,eligible:OutingPlan['members']=plan?eligiblePlanRecipients(plan):[
  {userId:actor,username:auth.user?.properties.username??'',status:'accepted',ticketState:'unknown'},
  ...people.data.map(friend=>({userId:friend.id,username:friend.username,avatarUrl:friend.avatarUrl,status:'accepted' as const,ticketState:'unknown' as const})),
 ];
 const [ids,setIds]=useState<string[]>(()=>!friendsOnly&&plan?.members.some(m=>m.userId===actor&&m.ticketState==='none'&&m.hasTicket===false&&!recipientHasPendingAccess(m))?[actor]:[]),[tier,setTier]=useState(''),[checkout,setCheckout]=useState(false),[extra,setExtra]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [choosingType,setChoosingType]=useState(false),[checkingPlan,setCheckingPlan]=useState(!!sourcePlan),[planError,setPlanError]=useState(false);
 const body=useRef<HTMLDivElement>(null),bodyScroll=useRef(0),planSource=useRef(sourcePlan);planSource.current=sourcePlan;
 const request=useRef<{fingerprint:string;key:string}|null>(null),submitting=useRef(false),alive=useRef(true),current=useRef(auth);current.current=auth;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{if(!open){setChoosingType(false);setCheckout(false);setExtra(false);setRecovery(undefined);setError('')}},[open]);
 // Every new opening rechecks membership and ticket state. Closing keeps the
 // local selection in this mounted, account/outing-scoped editor, never storage.
 useEffect(()=>{
  if(!open||!planSource.current)return;let stale=false;const original=planSource.current,token=auth.getToken();setCheckingPlan(true);setPlanError(false);
  void ApiClient.instance.get('/outings/plans/{planID}',{params:{path:{planID:original.id}},cache:'no-store'}).then(value=>{if(stale||current.current.getToken()!==token)return;const fresh=parsePlans([value])[0]!;setReviewedPlan(fresh);setIds(rows=>rows.filter(userId=>fresh.members.some(member=>member.userId===userId&&member.status==='accepted')));if(fresh.chosenEventId!==original.chosenEventId||fresh.decisionRound!==original.decisionRound){setError('groups.ticketSelectionUnavailable');setRecovery({kind:'review_outing',messageKey:'groups.ticketSelectionUnavailable',actionKey:'groups.viewOuting'})}}).catch(()=>{if(!stale)setPlanError(true)}).finally(()=>{if(!stale)setCheckingPlan(false)});
  return()=>{stale=true};
 },[open,sourcePlan?.id,sourcePlan?.decisionRound,actor]);
 useLayoutEffect(()=>{if(body.current)body.current.scrollTop=choosingType?0:bodyScroll.current},[choosingType]);
 const types=event?.ticketTypes?.filter(ticket=>getTicketAvailability(ticket,Date.now())==='available')??[],selected=types.find(ticket=>ticket.id===tier);
 useEffect(()=>{if(!tier&&types[0])setTier(types[0].id)},[tier,types]);
 const quantities=selected?{[selected.id]:ids.length}:{},totals=event&&selected&&ids.length?checkoutTotals(event,quantities):undefined;
 const transferable=plan?plan.giftPurchasesAvailable!==false:!!event&&event.giftPurchasesAvailable!==false&&Date.parse(event.startTime)>Date.now();
 const selectable=(member:OutingPlan['members'][number])=>!recipientHasPendingAccess(member)&&(member.userId===actor||transferable);
 const warning=ids.some(id=>eligible.some(m=>m.userId===id&&(m.ticketState==='valid'||m.hasTicket===true)));
 const unknown=ids.some(id=>eligible.some(m=>m.userId===id&&(m.ticketState===undefined||m.ticketState==='unknown')));
 const valid=!checkingPlan&&!planError&&!query.pending&&!query.refreshing&&!query.error&&!query.refreshError&&event?.status==='published'&&event.organizerId!==actor&&Date.parse(event.endTime)>Date.now()&&!!selected&&ids.length>0&&ids.length<=8&&getRemainingTicketCapacity(selected)>=ids.length&&ids.every(id=>eligible.some(m=>m.userId===id&&selectable(m)))&&(!(warning||unknown)||extra)&&(!plan||!!plan.decisionRound)&&(!sourcePlan||plan?.chosenEventId===sourcePlan.chosenEventId&&plan?.decisionRound===sourcePlan.decisionRound);
 const selection={...(plan?{planId:plan.id}:{}),decisionRound:plan?.decisionRound??0,recipientIds:ids,...(extra?{extraConfirmed:true}:{})};
 const continuePurchase=async()=>{
  if(!valid||!selected||busy||submitting.current)return;if(selected.priceRon>0){setCheckout(true);return}
  submitting.current=true;setBusy(true);setError('');const token=auth.getToken(),body={items:[{ticketTypeId:selected.id,quantity:ids.length}],outing:selection},fingerprint=JSON.stringify(body);
  if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,key:crypto.randomUUID()};
  try{await ApiClient.instance.post('/events/{id}/tickets/book',{params:{path:{id}},body,idempotencyKey:request.current.key});if(!alive.current||current.current.getToken()!==token||current.current.user?.properties.id!==actor)return;onClose();router.push(ids.every(person=>person!==actor)?'/ticket-transfers':'/users/me/tickets')}
  catch(cause){if(alive.current){const issue=outingCheckoutRecovery(cause);setRecovery(issue);setError(issue?.messageKey??'outings.v2.recipientChanged')}}finally{submitting.current=false;if(alive.current)setBusy(false)}
 };
 const reviewSelection=async()=>{
  if(busy)return;setBusy(true);const token=auth.getToken();try{
   if(plan){const fresh=parsePlans([await ApiClient.instance.get('/outings/plans/{planID}',{params:{path:{planID:plan.id}},cache:'no-store'})])[0]!;
    if(!alive.current||current.current.getToken()!==token)return;
    if(fresh.chosenEventId!==id||fresh.decisionRound!==plan.decisionRound||recovery?.kind==='review_outing'){onClose();router.push(fresh.groupId?'/groups/'+fresh.groupId+'/outings/'+fresh.id:'/outings/'+fresh.id);return}
    setReviewedPlan(fresh);setIds(selected=>selected.filter(id=>fresh.members.some(member=>member.userId===id&&member.status==='accepted'&&!recipientHasPendingAccess(member))));
   }
   const refreshed=await query.retryResult();if(!alive.current||current.current.getToken()!==token)return;if(!refreshed){setError('feedback.loadFailed');return}setPlanError(false);setExtra(false);setRecovery(undefined);setError('');
  }catch{setError('feedback.loadFailed')}finally{if(alive.current)setBusy(false)}
 };
 const solo=eligible.length===1&&eligible[0]?.userId===actor,hasFriend=ids.some(userId=>userId!==actor),availableAuto=eligible.filter(member=>member.ticketState==='none'&&member.hasTicket===false&&selectable(member));
 const selectedType=<><Ticket size={18} aria-hidden/><span><strong>{selected?.name??t('groups.selectTicketType')}</strong></span>{selected&&<small>{t('groups.pricePerPerson',{price:formatRon(selected.priceRon)})}</small>}{types.length>1&&<ChevronRight size={17} aria-hidden/>}</>;
 const closeCheckout=useCallback(()=>setCheckout(false),[]),keepQuantities=useCallback(()=>{},[]);
 return <><GroupSheet open={open&&!checkout} title={t(choosingType?'groups.selectTicketType':'groups.ticketEntry')} onBack={choosingType?()=>setChoosingType(false):undefined} onClose={onClose} bodyRef={body} busy={busy} testId="group-ticket-recipients" footer={choosingType?undefined:<>
  <div className={gs.ticketTotal} data-testid="group-ticket-total"><span>{t('checkout.total')}</span><strong>{totals?formatRon(totals.total):'—'}</strong></div>
  {totals?<p className={gs.sheetFee} data-testid="group-ticket-breakdown">{t('checkout.ticketCount',{count:totals.count})} · {formatRon(totals.subtotal)}{totals.fee>0&&<> + {formatRon(totals.fee)} {t('checkout.ticketingProcessingFee')}</>}</p>:<p className={gs.sheetFee}>{t('groups.ticketSelectionRequired')}</p>}
  <ActionButton data-testid="outing-recipients-continue" disabled={!valid||!!recovery} busy={busy} onClick={()=>void continuePurchase()}>{t('groups.continueTickets')}</ActionButton>
  {hasFriend&&<p className={gs.sheetFee}>{t('outings.v2.recipientsHint')}</p>}
 </>}>
  {choosingType?<div className={gs.ticketTypes} role="radiogroup" aria-label={t('groups.selectTicketType')}>{types.map(ticket=><button type="button" role="radio" aria-checked={tier===ticket.id} key={ticket.id} className={gs.ticketTypeOption} data-testid={'group-ticket-type-'+ticket.id} onClick={()=>{setTier(ticket.id);setChoosingType(false)}}><span><strong>{ticket.name}</strong>{ticket.description&&<small>{ticket.description}</small>}</span><span className={gs.ticketTypePrice}>{formatRon(ticket.priceRon)}<span className={gs.ticketChoiceMark} aria-hidden>{tier===ticket.id&&<Check size={14}/>}</span></span></button>)}</div>:<>
  {event?<div className={gs.ticketContext}><EventPreview title={event.title} imageUrl={event.bannerUrl} startTime={event.startTime} location={event.locationName}/></div>:<p className={s.muted}>{t('common.loading')}</p>}
  <section className={gs.ticketSection} aria-label={t('groups.ticketType')}><h3>{t('groups.ticketType')}</h3>{types.length>1?<button type="button" data-testid="group-ticket-type-open" className={gs.ticketTypeRow} onClick={()=>{bodyScroll.current=body.current?.scrollTop??0;setChoosingType(true)}}>{selectedType}</button>:<div data-testid="group-ticket-type-summary" className={gs.ticketTypeRow}>{selectedType}</div>}</section>
  <section className={gs.ticketSection}><div className={gs.ticketPeopleHeading}><h3>{t(solo?'groups.ticketsForYou':'groups.ticketsForWho')}</h3>{!solo&&!!availableAuto.length&&<ActionButton data-testid="group-ticket-select-without" tone="ghost" size="compact" disabled={busy||checkingPlan} onClick={()=>{setExtra(false);setIds(availableAuto.slice(0,8).map(member=>member.userId))}}>{t('groups.selectWithoutTickets')}</ActionButton>}</div>
  <div className={gs.ticketPeople}>{eligible.map(member=>{const checked=ids.includes(member.userId),status=member.ticketState??(member.hasTicket?'valid':member.hasTicket===false?'none':'unknown');return <label key={member.userId} className={gs.ticketPerson} data-disabled={busy||!selectable(member)||!checked&&ids.length>=8}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId}/><span className={gs.ticketPersonText}><strong>{member.username}{member.userId===actor&&<span> · {t('groups.ticketsYou')}</span>}</strong>{status!=='none'&&<small>{t(groupTicketLabel(status))}</small>}</span><input type="checkbox" data-testid={'outing-recipient-'+member.userId} disabled={busy||checkingPlan||!selectable(member)||!checked&&ids.length>=8} checked={checked} onChange={()=>{setExtra(false);setIds(rows=>rows.includes(member.userId)?rows.filter(id=>id!==member.userId):[...rows,member.userId])}}/><span className={gs.ticketChoiceMark} aria-hidden>{checked&&<Check size={14}/>}</span></label>})}</div>
  {pendingCount>0&&<p className={gs.sheetFee}>{t('groups.invitedCount',{count:pendingCount})}</p>}
  {eligible.length>8&&<p className={gs.sheetFee}>{t('groups.ticketRecipientLimit',{count:8})}</p>}
  {!plan&&!!people.error&&<ActionButton onClick={people.retry}>{t('common.retry')}</ActionButton>}
  </section>
  {!transferable&&!solo&&<p className={gs.sheetFee}>{t('outings.v2.giftWindowClosed')}</p>}
  {(warning||unknown)&&<section className={gs.ticketExtra}><p className={gs.sheetFee}>{t(warning?'groups.extraHint':'groups.unknownTicketConfirm')}</p><label className={gs.ticketExtraCheck}><input type="checkbox" data-testid="outing-extra-confirmation" checked={extra} onChange={e=>setExtra(e.target.checked)}/><span>{t('groups.extra')}</span></label></section>}
  {recovery?.kind==='existing_payment'&&recovery.orderId?<CheckoutReservationRecovery orderId={recovery.orderId} eventId={id} sessionId={plan?.myPendingPayment?.sessionId??plan?.myCheckoutReservation?.sessionId} attempted={!!plan?.myPendingPayment} onResolved={reviewSelection}/>:!!(planError||query.error||query.refreshError||error||recovery)&&<><p role="alert" className={s.error}>{t(recovery?.messageKey??(error||'feedback.loadFailed'))}</p><ActionButton data-testid="group-review-selection" tone="secondary" busy={busy} onClick={()=>void reviewSelection()}>{t(recovery?.actionKey??'common.retry')}</ActionButton></>}
  {!query.pending&&(!types.length||!!tier&&!selected)&&<p role="alert" className={s.muted}>{t('groups.ticketSelectionUnavailable')}</p>}
  </>}
 </GroupSheet>
 {open&&checkout&&event&&<TicketCheckoutDrawer event={event} quantities={quantities} onQuantitiesChange={keepQuantities} open onClose={closeCheckout} historyBack={false} outing={selection} recipientNames={ids.map(id=>eligible.find(member=>member.userId===id)?.username??'')} onOutingRecovery={issue=>{setCheckout(false);setRecovery(issue)}}/>}
 </>;
}
