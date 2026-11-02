"use client";
import { useEffect,useRef,useState } from 'react';
import { CalendarDays,Search,UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { canCreatePlan,planningToday,validPlanningDate } from '@packages/app-core/outings/model';
import { eventCities } from '@packages/app-core/events/constants';
import { shiftCalendarDay } from '@packages/app-core/events/discoveryFilters';
import { Field,Input } from '@/components/ui/Field';
import { ActionButton } from '@/components/ui/ActionButton';
import { ThemedSelect } from '@/features/events/form/ThemedSelect';
import { MemberAvatar } from './OutingPrimitives';
import type { useOutings } from './useOutings';
import s from './outings.module.css';
export { PlanChoice } from './PlanChoice';

export function OutingPlanBuilder({model,onCreated,onCancel}:{model:ReturnType<typeof useOutings>;onCreated:(id:string)=>void;onCancel:()=>void}) {
  const {t}=useTranslation(),form=useRef<HTMLFormElement>(null);
  const [title,setTitle]=useState(()=>t('outings.defaultName')),[day,setDay]=useState(planningToday),[city,setCity]=useState('Bucuresti');
  const [friends,setFriends]=useState<string[]>([]),[search,setSearch]=useState(''),[submitted,setSubmitted]=useState(false);
  useEffect(()=>{void model.store.searchEvents();},[model.store]);
  const errors={title:submitted&&!title.trim(),date:submitted&&!validPlanningDate(day),city:submitted&&!eventCities.includes(city),friends:submitted&&(friends.length<1||friends.length>7)};
  const create=async(event:React.FormEvent)=>{
    event.preventDefault();if(model.working)return;setSubmitted(true);
    if(!canCreatePlan(title,day,city,friends)){requestAnimationFrame(()=>form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());return;}
    const result=await model.store.createPlan({title:title.trim(),outingDate:day,city,friendIds:friends});if(result)onCreated(result.id);
  };
  const visible=model.friends.filter(friend=>friend.username.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <form ref={form} onSubmit={event=>void create(event)} noValidate>
    <div className={s.layout}>
      <section className={s.section}>
        <div className={s.sectionHeader}><h2 className={s.meta}><CalendarDays size={20} aria-hidden/>{t('outings.ui.detailTitle')}</h2></div>
        <div className={s.formFields}>
          <Field label={t('outings.planName')} error={errors.title?t('outings.ui.invalidTitle'):undefined}><Input data-testid="outing-title" name="outing-title" autoComplete="off" value={title} maxLength={80} disabled={model.working} onChange={event=>setTitle(event.target.value)}/></Field>
          <div className={s.twoFields}>
            <Field label={t('outings.date')} error={errors.date?t('outings.ui.invalidDate'):undefined}><Input data-testid="outing-date" name="outing-date" type="date" min={planningToday()} max={shiftCalendarDay(planningToday(),365)} value={day} disabled={model.working} onChange={event=>setDay(event.target.value)}/></Field>
            <Field label={t('outings.city')} error={errors.city?t('outings.ui.invalidCity'):undefined}><ThemedSelect testId="outing-city" value={city} onChange={setCity} placeholder={t('outings.city')} disabled={model.working} options={eventCities.map(value=>({value,label:value}))}/></Field>
          </div>
          <p className={s.muted}>{t('outings.contextHint')}</p>
        </div>
      </section>
      <fieldset className={s.section} aria-invalid={errors.friends||undefined} aria-describedby="outing-friends-hint" tabIndex={-1}>
        <legend className="sr-only">{t('outings.ui.friendsTitle')}</legend>
        <div className={s.sectionHeader}><h2 className={s.meta}><UsersRound size={20} aria-hidden/>{t('outings.ui.friendsTitle')}</h2><span className={s.pill}>{friends.length}/7</span></div>
        <p id="outing-friends-hint" className={errors.friends?s.error:s.muted}>{t(errors.friends?'outings.ui.invalidFriends':'outings.ui.friendsHint')}</p>
        <div className={s.search}><Search size={17} aria-hidden/><Input data-testid="outing-friend-search" type="search" aria-label={t('outings.ui.searchFriends')} placeholder={t('outings.ui.searchFriends')} value={search} onChange={event=>setSearch(event.target.value)}/></div>
        <div className={s.friendList}>
          {visible.map(friend=><label key={friend.id} className={s.friend} data-selected={friends.includes(friend.id)}>
            <MemberAvatar name={friend.username}/><span>{friend.username}</span>
            <input type="checkbox" aria-label={friend.username} checked={friends.includes(friend.id)} disabled={model.working||friends.length>=7&&!friends.includes(friend.id)}
              onChange={()=>setFriends(rows=>rows.includes(friend.id)?rows.filter(id=>id!==friend.id):[...rows,friend.id])}/>
          </label>)}
          {!model.catalogPending&&!visible.length&&<p className={s.muted}>{t(model.friends.length?'outings.ui.noFriendResults':'outings.noFriends')}</p>}
        </div>
        <p className={s.muted} role="status">{t('outings.ui.selected',{count:friends.length})}</p>
      </fieldset>
    </div>
    <div className={s.formActions}><ActionButton tone="secondary" disabled={model.working} onClick={onCancel}>{t('common.cancel')}</ActionButton><ActionButton data-testid="outing-create" type="submit" busy={model.working}>{t('outings.create')}</ActionButton></div>
  </form>;
}
