"use client";
import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { feedDate } from '@packages/app-core/feed/model';
import { ActionButton } from '@/components/ui/ActionButton';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { OutingPlanBuilder } from './OutingPlanBuilder';
import { SuggestForOuting } from './SuggestForOuting';
import type { useOutings } from './useOutings';
import s from './outings.module.css';

export function EventOutingStart({eventId,model,onOpen,onCancel}:{eventId:string;model:ReturnType<typeof useOutings>;onOpen:(id:string)=>void;onCancel:()=>void}) {
  const {t,i18n}=useTranslation(),[existing,setExisting]=useState(false),event=model.sourceEvent;
  useEffect(()=>{void model.store.loadSourceEvent(eventId);},[eventId,model.store]);
  if(model.sourceError)return <StatusNotice kind="error" title={t(model.sourceError)} action={()=>void model.store.loadSourceEvent(eventId)} actionLabel={t('common.retry')}/>;
  if(!event||event.id!==eventId||model.sourcePending)return <StatusNotice kind="loading" title={t('common.loading')}/>;
  return <div className={s.stack} data-testid="event-outing-start">
    <section className={s.section} aria-labelledby="outing-source-title">
      <p className={s.eyebrow}><Ticket size={15} aria-hidden/>{t('outings.eventStart.proposal')}</p>
      <div className={s.sectionHeader}><h2 id="outing-source-title">{event.title}</h2></div>
      <div className={s.stack} style={{gap:8}}><p className={s.meta}><CalendarDays size={16} aria-hidden/>{feedDate(event,i18n.language)}</p><p className={s.meta}><MapPin size={16} aria-hidden/>{event.locationName} · {event.city}</p><p className={s.muted}>{t('outings.chosenHint')}</p></div>
    </section>
    <div className={s.actions}><ActionButton tone="secondary" data-testid="outing-toggle-existing" aria-expanded={existing} aria-controls="outing-existing" disabled={model.working} onClick={()=>setExisting(value=>!value)}>{t(existing?'outings.eventStart.newInstead':'outings.eventStart.addExisting')}</ActionButton></div>
    <div hidden={existing}><OutingPlanBuilder key={event.id} model={model} sourceEvent={event} onCreated={onOpen} onCancel={onCancel}/></div>
    <div id="outing-existing" hidden={!existing}>{existing&&<SuggestForOuting event={event} model={model} onProposed={onOpen}/>}</div>
  </div>;
}
