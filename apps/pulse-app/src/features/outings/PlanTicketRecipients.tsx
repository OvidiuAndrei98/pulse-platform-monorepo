"use client";
import {useState,useEffect,useRef} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslation} from 'react-i18next';
import {ApiClient} from '@packages/api-client/client';
import type {OutingPlan,PlanFriend} from '@packages/app-core/outings/model';
import {automaticPlanRecipients,eligiblePlanRecipients,recipientHasPendingAccess} from '@packages/app-core/outings/experience';
import {groupTicketLabel} from '@packages/app-core/social/groups';
import {getTicketAvailability,getRemainingTicketCapacity} from '@packages/app-core/checkout/ticketAvailability';
import {checkoutTotals} from '@packages/app-core/checkout/totals';
import {formatRon} from '@packages/app-core/events/serviceFee';
import type {Event} from '@/core/DataProvider';
import {useDataProvider} from '@/core/DataProviderContext';
import {useCachedClientQuery} from '@/lib/useCachedClientQuery';
import {ModalFrame,ModalHeader} from '@/components/ui/ModalFrame';
import {ActionButton} from '@/components/ui/ActionButton';
import {ThemedSelect} from '@/features/events/form/ThemedSelect';
import {TicketCheckoutDrawer} from '@/features/checkout/TicketCheckoutDrawer';
import {MemberAvatar} from './OutingPrimitives';
import s from './outings.module.css';

type Props={plan?:OutingPlan;eventId?:string;actor:string;onClose:()=>void;friendsOnly?:boolean};
export function PlanTicketRecipients({plan,eventId,actor,onClose,friendsOnly=false}:Props){
 const {t}=useTranslation(),auth=useDataProvider(),router=useRouter(),id=plan?.chosenEventId??eventId??'';
 const query=useCachedClientQuery<Event|null>('plan-purchase:'+actor+':'+id,()=>ApiClient.instance.get('/events/{id}',{params:{path:{id}},cache:'no-store'}),null);
 const people=useCachedClientQuery<PlanFriend[]>(plan?null:'gift-friends:'+actor,()=>ApiClient.instance.get('/friends',{cache:'no-store'}),[]);
 const event=query.data,eligible:OutingPlan['members']=plan?eligiblePlanRecipients(plan):[
  {userId:actor,username:auth.user?.properties.username??'',status:'accepted',ticketState:'unknown'},
  ...people.data.map(friend=>({userId:friend.id,username:friend.username,avatarUrl:friend.avatarUrl,status:'accepted' as const,ticketState:'unknown' as const})),
 ];
 const [ids,setIds]=useState<string[]>(()=>!friendsOnly&&plan?.members.some(m=>m.userId===actor&&m.ticketState==='none'&&m.hasTicket===false&&!recipientHasPendingAccess(m))?[actor]:[]),[tier,setTier]=useState(''),[checkout,setCheckout]=useState(false),[extra,setExtra]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<{fingerprint:string;key:string}|null>(null),alive=useRef(true),current=useRef(auth);current.current=auth;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const types=event?.ticketTypes?.filter(ticket=>getTicketAvailability(ticket,Date.now())==='available')??[],selected=types.find(ticket=>ticket.id===tier);
 useEffect(()=>{if(!tier&&types[0])setTier(types[0].id)},[tier,types]);
 const quantities=selected?{[selected.id]:ids.length}:{},totals=event&&selected&&ids.length?checkoutTotals(event,quantities):undefined;
 const transferable=plan?plan.giftPurchasesAvailable!==false:!!event&&event.giftPurchasesAvailable!==false&&Date.parse(event.startTime)>Date.now();
 const selectable=(member:OutingPlan['members'][number])=>!recipientHasPendingAccess(member)&&(member.userId===actor||transferable);
 const warning=ids.some(id=>eligible.some(m=>m.userId===id&&(m.ticketState==='valid'||m.hasTicket===true)));
 const unknown=ids.some(id=>eligible.some(m=>m.userId===id&&(m.ticketState===undefined||m.ticketState==='unknown')));
 const valid=!!selected&&ids.length>0&&ids.length<=8&&getRemainingTicketCapacity(selected)>=ids.length&&ids.every(id=>eligible.some(m=>m.userId===id&&selectable(m)))&&(!(warning||unknown)||extra)&&(!plan||!!plan.decisionRound);
 const selection={...(plan?{planId:plan.id}:{}),decisionRound:plan?.decisionRound??0,recipientIds:ids,...(extra?{extraConfirmed:true}:{})};
 const continuePurchase=async()=>{
  if(!valid||!selected||busy)return;if(selected.priceRon>0){setCheckout(true);return}
  setBusy(true);setError('');const token=auth.getToken(),body={items:[{ticketTypeId:selected.id,quantity:ids.length}],outing:selection},fingerprint=JSON.stringify(body);
  if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,key:crypto.randomUUID()};
  try{await ApiClient.instance.post('/events/{id}/tickets/book',{params:{path:{id}},body,idempotencyKey:request.current.key});if(!alive.current||current.current.getToken()!==token||current.current.user?.properties.id!==actor)return;onClose();router.push(ids.every(person=>person!==actor)?'/ticket-transfers':'/users/me/tickets')}
  catch(cause){if(alive.current)setError((cause as {code?:string;message?:string}).code==='TICKET_GIFT_WINDOW_CLOSED'||(cause as {message?:string}).message==='TICKET_GIFT_WINDOW_CLOSED'?'outings.v2.giftWindowClosed':'outings.v2.recipientChanged')}finally{if(alive.current)setBusy(false)}
 };
 return <><ModalFrame open={!checkout} label={t('outings.v2.recipients')} onClose={onClose}><ModalHeader title={t('outings.v2.recipients')} onClose={onClose}/><div className={s.planModalV2}>
  <strong>{event?.title}</strong><p className={s.muted}>{t('outings.v2.recipientsHint')}</p>
  {!transferable&&<p className={s.muted}>{t('outings.v2.giftWindowClosed')}</p>}
  {eligible.map(member=><label key={member.userId} className={s.recipientV2}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId}/><span><strong>{member.username}</strong><small>{t(groupTicketLabel(member.ticketState??(member.hasTicket?'valid':member.hasTicket===false?'none':'unknown')))}</small>{member.attendance==='no'&&<small>{t('groups.no')}</small>}</span><input type="checkbox" data-testid={'outing-recipient-'+member.userId} disabled={busy||!selectable(member)} checked={ids.includes(member.userId)} onChange={()=>{setExtra(false);setIds(rows=>rows.includes(member.userId)?rows.filter(id=>id!==member.userId):[...rows,member.userId])}}/></label>)}
  {!!plan&&<ActionButton tone="ghost" onClick={()=>{setExtra(false);setIds(automaticPlanRecipients(plan).filter(selectable).map(m=>m.userId))}}>{t('groups.selectWithoutTickets')}</ActionButton>}
  {!plan&&!!people.error&&<ActionButton onClick={people.retry}>{t('common.retry')}</ActionButton>}
  {(warning||unknown)&&<div><p className={s.muted}>{t(warning?'groups.extraHint':'groups.unknownTicketConfirm')}</p><label className={s.recipientV2}><input type="checkbox" data-testid="outing-extra-confirmation" checked={extra} onChange={e=>setExtra(e.target.checked)}/><span>{t('groups.extra')}</span></label></div>}
  <ThemedSelect value={selected?.id??''} placeholder={t('checkout.tickets')} options={types.map(ticket=>({value:ticket.id,label:ticket.name+' · '+formatRon(ticket.priceRon)}))} onChange={setTier}/>
  {(query.error||error)&&<><p role="alert" className={s.error}>{t(error||'feedback.loadFailed')}</p><ActionButton onClick={query.retry}>{t('common.retry')}</ActionButton></>}
  {!query.pending&&(!types.length||!!tier&&!selected)&&<p role="alert" className={s.muted}>{t('checkout.selectionUnavailable')}</p>}
  {totals&&<strong>{t('checkout.total')} · {formatRon(totals.total)}</strong>}<p className={s.muted}>{t('outings.v2.transferHint')}</p>
  <ActionButton data-testid="outing-recipients-continue" disabled={!valid} busy={busy} onClick={()=>void continuePurchase()}>{t(ids.length===1?'outings.v2.continueOne':'outings.v2.continue',{count:ids.length})}</ActionButton>
 </div></ModalFrame>
 {checkout&&event&&<TicketCheckoutDrawer event={event} quantities={quantities} onQuantitiesChange={()=>{}} open onClose={onClose} historyBack={false} outing={selection} recipientNames={ids.map(id=>eligible.find(m=>m.userId===id)!.username)}/>}
 </>;
}
