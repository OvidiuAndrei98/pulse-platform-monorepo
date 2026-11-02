"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ApiClient, type ReadableSchema } from '@packages/api-client/client';
import { canOfferTransfer, type TicketTransfer } from '@packages/app-core/outings/model';
import { useCachedClientQuery } from '@/lib/useCachedClientQuery';
import { ActionButton } from '@/components/ui/ActionButton';
import { Input } from '@/components/ui/Field';
import { PlanChoice } from './OutingPlanBuilder';
import type { useOutings } from './useOutings';

export function TicketTransfers({model,initialTicketId}:{model:ReturnType<typeof useOutings>;initialTicketId?:string}) {
  const {t}=useTranslation(),actor=model.user?.properties.id;
  const tickets=useCachedClientQuery<ReadableSchema<'UserTicketResponse'>[]>(actor?'outings-tickets:'+actor:null,()=>ApiClient.instance.get('/users/me/tickets',{cache:'no-store'}),[]);
  const [selected,setSelected]=useState(initialTicketId??''),[email,setEmail]=useState(''),[confirmed,setConfirmed]=useState(false);
  const eligible=tickets.data.filter(ticket=>canOfferTransfer(ticket)),ticket=eligible.find(ticket=>ticket.id===selected);
  const refreshTickets=()=>tickets.retry();
  const send=async()=>{
    if(!ticket||!confirmed)return;
    const payload={ticketId:ticket.id,recipientEmail:email.trim().toLowerCase()};
    if(await model.store.createTransfer(payload.ticketId,payload.recipientEmail)){setSelected('');setEmail('');setConfirmed(false);refreshTickets();}
  };
  const respond=async(id:string,status:'accepted'|'declined'|'cancelled')=>{if(await model.store.respondTransfer(id,status))refreshTickets();};
  return <section className="space-y-5">
    <p className="text-sm text-muted-foreground">{t('outings.financialHint')}</p>
    {model.transfers.map(x=><article key={x.id} data-testid={'transfer-'+x.id} className="space-y-3 rounded-3xl border border-white/10 p-5">
      <h2 className="text-xl font-semibold">{x.eventTitle}</h2><p className="text-sm text-muted-foreground">{x.senderId===actor?x.recipientName||t('outings.to'):t('outings.from',{name:x.senderName})} · {t('outings.'+x.status)}</p>
      {x.status==='pending'&&<div className="flex flex-wrap gap-3">{x.senderId===actor?<ActionButton tone="secondary" disabled={model.working} onClick={()=>void respond(x.id,'cancelled')}>{t('outings.cancel')}</ActionButton>:<><ActionButton data-testid={'transfer-accept-'+x.id} disabled={model.working} onClick={()=>void respond(x.id,'accepted')}>{t('outings.acceptTransfer')}</ActionButton><ActionButton tone="secondary" disabled={model.working} onClick={()=>void respond(x.id,'declined')}>{t('outings.decline')}</ActionButton></>}</div>}
    </article>)}
    {!model.transfers.length&&<p className="text-muted-foreground">{t('outings.emptyTransfers')}</p>}
    <h2 className="text-xl font-semibold">{t('outings.transferTitle')}</h2><p className="text-sm text-muted-foreground">{t('outings.transferHint')}</p><p className="text-sm text-muted-foreground">{t('outings.cutoffHint')}</p>
    {Boolean(tickets.error)&&<ActionButton tone="secondary" onClick={tickets.retry}>{t('common.retry')}</ActionButton>}
    {eligible.map(ticket=><PlanChoice key={ticket.id} title={ticket.eventTitle+' · '+ticket.ticketTypeName} hint={ticket.id.slice(0,8)} checked={selected===ticket.id} disabled={model.working} onChange={()=>{setSelected(ticket.id);setConfirmed(false);}}/>)}
    {ticket&&<>
      <label className="block space-y-2"><span>{t('outings.email')}</span><Input data-testid="transfer-email" type="email" maxLength={254} value={email} disabled={model.working} onChange={e=>setEmail(e.target.value)}/></label>
      <PlanChoice title={t('outings.confirmTransfer')} checked={confirmed} disabled={model.working} onChange={()=>setConfirmed(v=>!v)}/>
      <ActionButton data-testid="transfer-send" busy={model.working} disabled={!confirmed||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())||email.trim().toLowerCase()===model.user?.properties.email.toLowerCase()} onClick={()=>void send()}>{t('outings.send')}</ActionButton>
    </>}
    <Link className="inline-flex min-h-11 items-center text-primary underline" href="/users/me/tickets">{t('outings.openTickets')}</Link>
  </section>;
}
