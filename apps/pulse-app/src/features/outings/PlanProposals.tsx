"use client";
import { useEffect,useState } from 'react';
import { Check,Plus,Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { matchesPlanningContext,type OutingPlan } from '@packages/app-core/outings/model';
import { outingDate } from '@packages/app-core/outings/presentation';
import { Input } from '@/components/ui/Field';
import { ActionButton,IconButton } from '@/components/ui/ActionButton';
import type { useOutings } from './useOutings';
import s from './outings.module.css';

export function PlanProposals({plan,model,onProposed}:{plan:OutingPlan;model:ReturnType<typeof useOutings>;onProposed?:()=>void}) {
  const {t,i18n}=useTranslation(),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  useEffect(()=>{const timer=setTimeout(()=>{setPage(1);void model.store.searchEvents(search,1,plan);},250);return()=>clearTimeout(timer);},[search,model.store,plan.id,plan.outingDate,plan.city]);
  const events=model.events.filter(event=>matchesPlanningContext(event,plan));
  return <section className={s.section} aria-label={t('outings.propose')}>
    <div><h3 className="text-lg font-semibold">{t('outings.propose')}</h3><p className={s.muted}>{t('outings.proposeHint')}</p></div>
    <div className={s.search}><Search size={17} aria-hidden/><Input data-testid="outing-search" type="search" aria-label={t('outings.search')} placeholder={t('outings.search')} value={search} onChange={event=>setSearch(event.target.value)}/></div>
    <div className={s.stack} style={{gap:8,marginTop:12}}>
      {events.map(event=>{const added=plan.options.some(option=>option.eventId===event.id);return <div key={event.id} className={s.candidate}>
        <div><strong>{event.title}</strong><p className={s.muted}>{outingDate(plan.outingDate,i18n.language)} · {event.locationName}</p></div>
        <IconButton data-testid={'outing-propose-'+event.id} label={t(added?'outings.ui.proposed':'outings.ui.add')+': '+event.title}
          disabled={model.working||plan.options.length>=8||added} onClick={()=>void model.store.propose(plan.id,event.id).then(result=>{if(result)onProposed?.();})}>
          {added?<Check size={18} aria-hidden/>:<Plus size={18} aria-hidden/>}
        </IconButton>
      </div>;})}
      {model.catalogPending&&<p role="status" className={s.muted}>{t('outings.ui.searchLoading')}</p>}
      {!model.catalogPending&&!events.length&&<p className={s.muted}>{t('outings.ui.searchEmpty')}</p>}
    </div>
    {model.moreEvents&&<ActionButton tone="ghost" busy={model.catalogPending} onClick={()=>{setPage(page+1);void model.store.searchEvents(search,page+1,plan);}}>{t('outings.more')}</ActionButton>}
  </section>;
}
