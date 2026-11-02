"use client";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesPlanningContext, type OutingPlan } from '@packages/app-core/outings/model';
import { Input } from '@/components/ui/Field';
import { ActionButton } from '@/components/ui/ActionButton';
import type { useOutings } from './useOutings';

export function PlanProposals({plan,model}:{plan:OutingPlan;model:ReturnType<typeof useOutings>}) {
  const {t}=useTranslation(),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  useEffect(()=>{
    const timer=setTimeout(()=>{setPage(1);void model.store.searchEvents(search,1,plan);},250);
    return()=>clearTimeout(timer);
  },[search,model.store,plan.id,plan.outingDate,plan.city]);
  const events=model.events.filter(event=>matchesPlanningContext(event,plan));
  return <section className="space-y-3">
    <h3 className="font-semibold">{t('outings.propose')}</h3><p className="text-sm text-muted-foreground">{t('outings.proposeHint')}</p>
    <Input data-testid="outing-search" aria-label={t('outings.search')} placeholder={t('outings.search')} value={search} onChange={e=>setSearch(e.target.value)}/>
    {events.map(event=><ActionButton key={event.id} data-testid={'outing-propose-'+event.id} className="w-full" tone="secondary"
      disabled={model.working||plan.options.length>=8||plan.options.some(option=>option.eventId===event.id)}
      onClick={()=>void model.store.propose(plan.id,event.id)}>{event.title}</ActionButton>)}
    {model.moreEvents&&<ActionButton tone="ghost" busy={model.catalogPending}
      onClick={()=>{setPage(page+1);void model.store.searchEvents(search,page+1,plan);}}>{t('outings.more')}</ActionButton>}
  </section>;
}
