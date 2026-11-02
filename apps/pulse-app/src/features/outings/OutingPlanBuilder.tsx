"use client";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { canCreatePlan, type OutingPlan, type PlanEvent } from '@packages/app-core/outings/model';
import { Input } from '@/components/ui/Field';
import { ActionButton } from '@/components/ui/ActionButton';
import { formatEventDate, formatEventTime } from '@/features/events/dateFormat';
import type { useOutings } from './useOutings';

export function OutingPlanBuilder({model,onCreated,onCancel}:{model:ReturnType<typeof useOutings>;onCreated:(id:string)=>void;onCancel:()=>void}) {
  const {t}=useTranslation(),[title,setTitle]=useState(()=>t('outings.defaultName')),[search,setSearch]=useState(''),[selected,setSelected]=useState<PlanEvent[]>([]),[friends,setFriends]=useState<string[]>([]),[page,setPage]=useState(1);
  useEffect(()=>{const timer=setTimeout(()=>{setPage(1);void model.store.searchEvents(search);},250);return()=>clearTimeout(timer);},[search,model.store]);
  const create=async()=>{
    const payload={title:title.trim(),eventIds:selected.map(e=>e.id),friendIds:friends};if(!canCreatePlan(payload.title,payload.eventIds,friends))return;
    const result=await model.store.createPlan(payload);if(result)onCreated(result.id);
  };
  return <section className="space-y-5">
    <h2 className="text-xl font-semibold">{t('outings.newPlan')}</h2>
    <label className="block space-y-2"><span>{t('outings.planName')}</span><Input data-testid="outing-title" value={title} maxLength={80} disabled={model.working} onChange={e=>setTitle(e.target.value)}/></label>
    <fieldset className="space-y-3"><legend className="mb-3 font-semibold">{t('outings.events')}</legend>
      <Input data-testid="outing-search" aria-label={t('outings.search')} placeholder={t('outings.search')} value={search} onChange={e=>setSearch(e.target.value)}/>
      {selected.filter(e=>!model.events.some(v=>v.id===e.id)).map(e=><PlanChoice key={e.id} title={e.title} checked onChange={()=>setSelected(rows=>rows.filter(v=>v.id!==e.id))}/>)}
      {model.events.map(e=><PlanChoice key={e.id} title={e.title} hint={formatEventDate(e.startTime)+' · '+formatEventTime(e.startTime)+' · '+e.locationName} checked={selected.some(v=>v.id===e.id)} disabled={model.working||selected.length>=4&&!selected.some(v=>v.id===e.id)} onChange={()=>setSelected(rows=>rows.some(v=>v.id===e.id)?rows.filter(v=>v.id!==e.id):[...rows,e])}/>)}
      {model.moreEvents&&<ActionButton tone="secondary" busy={model.catalogPending} onClick={()=>{setPage(page+1);void model.store.searchEvents(search,page+1);}}>{t('outings.more')}</ActionButton>}
    </fieldset>
    <fieldset className="space-y-3"><legend className="mb-3 font-semibold">{t('outings.friends')}</legend>
      {!model.friends.length&&!model.catalogPending&&<p className="text-muted-foreground">{t('outings.noFriends')}</p>}
      {model.friends.map(f=><PlanChoice key={f.id} title={f.username} checked={friends.includes(f.id)} disabled={model.working||friends.length>=7&&!friends.includes(f.id)} onChange={()=>setFriends(rows=>rows.includes(f.id)?rows.filter(id=>id!==f.id):[...rows,f.id])}/>)}
    </fieldset>
    <ActionButton data-testid="outing-create" busy={model.working} disabled={!canCreatePlan(title,selected.map(e=>e.id),friends)} onClick={()=>void create()}>{t('outings.create')}</ActionButton>
    <ActionButton tone="ghost" disabled={model.working} onClick={onCancel}>{t('common.cancel')}</ActionButton>
  </section>;
}
export function PlanChoice({title,hint,checked,disabled,onChange}:{title:string;hint?:string;checked:boolean;disabled?:boolean;onChange:()=>void}) {
  return <label className={'flex min-h-14 items-center gap-3 rounded-2xl border p-4 '+(checked?'border-primary bg-primary/5':'border-white/10')+(disabled?' opacity-50':' cursor-pointer')}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-5 w-5 shrink-0 accent-primary"/>
    <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>{hint&&<span className="mt-1 block text-sm text-muted-foreground">{hint}</span>}</span>
  </label>;
}
