"use client";
import {useEffect,useState,type Dispatch,type SetStateAction} from 'react';
import {useTranslation} from 'react-i18next';
import type {TicketTier} from '@/core/DataProvider';
import {formatRon} from '@packages/app-core/events/serviceFee';
import {changeTicketQuantity,getTicketAvailability,retainAvailableTickets,ticketQuantityLimit} from '@packages/app-core/checkout/ticketAvailability';
import {TicketQuantityStepper} from '@/components/ui/TicketQuantityStepper';
export {getTicketAvailability,getRemainingTicketCapacity,isTicketSelectionAvailable} from '@packages/app-core/checkout/ticketAvailability';
export type {TicketAvailability} from '@packages/app-core/checkout/ticketAvailability';

export function TicketTypeSelector({tickets,quantities,onChange,disabled}:{tickets:readonly TicketTier[];quantities:Record<string,number>;onChange:Dispatch<SetStateAction<Record<string,number>>>;disabled?:boolean}) {
  const {t}=useTranslation(),[nowMs,setNowMs]=useState<number|null>(null);
  useEffect(()=>{
    let timeout:number|undefined;
    const refresh=()=>{
      if(timeout!==undefined)window.clearTimeout(timeout);
      const now=Date.now();setNowMs(now);
      const next=tickets.flatMap(ticket=>[Date.parse(ticket.startSales),Date.parse(ticket.endSales)]).filter(boundary=>Number.isFinite(boundary)&&boundary>now).sort((a,b)=>a-b)[0];
      timeout=window.setTimeout(refresh,next===undefined?60_000:Math.min(60_000,Math.max(250,next-now+50)));
    };
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    refresh();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
    return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);if(timeout!==undefined)window.clearTimeout(timeout);};
  },[tickets]);
  useEffect(()=>{if(nowMs!==null)onChange(current=>retainAvailableTickets(tickets,current,nowMs));},[tickets,quantities,nowMs,onChange]);
  return <fieldset className="space-y-2.5" disabled={disabled}>
    <legend className="sr-only">{t('checkout.selectTickets')}</legend>
    {tickets.some(ticket=>ticket.priceRon===0)&&<p className="text-xs leading-5 text-muted-foreground">{t('checkout.freeIndividualBooking')}</p>}
    {tickets.map(ticket=>{
      const availability=getTicketAvailability(ticket,nowMs),unavailable=availability!=='available',value=quantities[ticket.id]??0;
      const status=availability==='sold-out'?t('checkout.soldOut'):availability==='sales-ended'?t('checkout.salesEnded'):availability==='sales-not-started'?t('checkout.salesNotStarted'):null;
      return <article key={ticket.id} data-testid={'event-ticket-'+ticket.id} className={`space-y-3 rounded-2xl border p-4 ${value>0&&!unavailable?'border-primary bg-primary/10':'border-white/10 bg-white/[0.03]'}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold text-white">{ticket.name}</h3>{ticket.description&&<p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{ticket.description}</p>}</div><span className="max-w-[45%] text-right text-sm font-semibold text-primary">{status??(ticket.priceRon===0?t('checkout.free'):formatRon(ticket.priceRon))}</span></div>
        <div className="flex justify-end"><TicketQuantityStepper name={ticket.name} value={unavailable?0:value} maximum={ticketQuantityLimit(tickets,quantities,ticket.id,nowMs)} disabled={disabled||unavailable} testIDPrefix={'event-ticket-'+ticket.id} onStep={delta=>onChange(current=>changeTicketQuantity(tickets,current,ticket.id,(current[ticket.id]??0)+delta,nowMs))}/></div>
      </article>;
    })}
  </fieldset>;
}
