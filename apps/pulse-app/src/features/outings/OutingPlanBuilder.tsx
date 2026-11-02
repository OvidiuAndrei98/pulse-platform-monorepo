"use client";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { canCreatePlan, planningToday } from '@packages/app-core/outings/model';
import { eventCities } from '@packages/app-core/events/constants';
import { shiftCalendarDay } from '@packages/app-core/events/discoveryFilters';
import { Field, Input } from '@/components/ui/Field';
import { ActionButton } from '@/components/ui/ActionButton';
import { ThemedSelect } from '@/features/events/form/ThemedSelect';
import { PlanChoice } from './PlanChoice';
import type { useOutings } from './useOutings';
export { PlanChoice } from './PlanChoice';

export function OutingPlanBuilder({model,onCreated,onCancel}:{
  model:ReturnType<typeof useOutings>;onCreated:(id:string)=>void;onCancel:()=>void;
}) {
  const {t}=useTranslation();
  const [title,setTitle]=useState(()=>t('outings.defaultName'));
  const [day,setDay]=useState(planningToday),[city,setCity]=useState('Bucuresti');
  const [friends,setFriends]=useState<string[]>([]);
  useEffect(()=>{void model.store.searchEvents();},[model.store]);
  const create=async()=>{
    if(!canCreatePlan(title,day,city,friends))return;
    const result=await model.store.createPlan({title:title.trim(),outingDate:day,city,friendIds:friends});
    if(result)onCreated(result.id);
  };
  return <section className="space-y-5">
    <h2 className="text-xl font-semibold">{t('outings.newPlan')}</h2>
    <Field label={t('outings.planName')}><Input data-testid="outing-title" value={title} maxLength={80} disabled={model.working} onChange={e=>setTitle(e.target.value)}/></Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('outings.date')}><Input data-testid="outing-date" type="date" min={planningToday()} max={shiftCalendarDay(planningToday(),365)} value={day} disabled={model.working} onChange={e=>setDay(e.target.value)}/></Field>
      <Field label={t('outings.city')}><ThemedSelect testId="outing-city" value={city} onChange={setCity} placeholder={t('outings.city')} disabled={model.working} options={eventCities.map(value=>({value,label:value}))}/></Field>
    </div>
    <p className="text-sm text-muted-foreground">{t('outings.contextHint')}</p>
    <fieldset className="space-y-3"><legend className="mb-3 font-semibold">{t('outings.friends')}</legend>
      {!model.friends.length&&!model.catalogPending&&<p className="text-muted-foreground">{t('outings.noFriends')}</p>}
      {model.friends.map(friend=><PlanChoice key={friend.id} title={friend.username} checked={friends.includes(friend.id)}
        disabled={model.working||friends.length>=7&&!friends.includes(friend.id)}
        onChange={()=>setFriends(rows=>rows.includes(friend.id)?rows.filter(id=>id!==friend.id):[...rows,friend.id])}/>)}
    </fieldset>
    <ActionButton data-testid="outing-create" busy={model.working} disabled={!canCreatePlan(title,day,city,friends)} onClick={()=>void create()}>{t('outings.create')}</ActionButton>
    <ActionButton tone="ghost" disabled={model.working} onClick={onCancel}>{t('common.cancel')}</ActionButton>
  </section>;
}
