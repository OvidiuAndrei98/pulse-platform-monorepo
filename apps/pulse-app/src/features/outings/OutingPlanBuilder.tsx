"use client";
import { useEffect,useState } from 'react';
import { ArrowRight,Check,ChevronRight,Clock,Info,Plus,X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { canCreatePlan,eventPlanDraft,eventPlanningContext,planningToday,validPlanningDate,type PlanEvent } from '@packages/app-core/outings/model';
import { defaultDecisionAt,outingDate } from '@packages/app-core/outings/presentation';
import { eventCities } from '@packages/app-core/events/constants';
import { shiftCalendarDay } from '@packages/app-core/events/discoveryFilters';
import { Field,Input } from '@/components/ui/Field';
import { ActionButton } from '@/components/ui/ActionButton';
import { ModalFrame,ModalHeader } from '@/components/ui/ModalFrame';
import { ThemedSelect } from '@/features/events/form/ThemedSelect';
import { DateBlock,MemberAvatar } from './OutingPrimitives';
import type { useOutings } from './useOutings';
import s from './outings.module.css';
export { PlanChoice } from './PlanChoice';

export function OutingPlanBuilder({model,onCreated,onCancel,sourceEvent}:{model:ReturnType<typeof useOutings>;onCreated:(id:string)=>void;onCancel:()=>void;sourceEvent?:PlanEvent}) {
 const {t,i18n}=useTranslation();
 const context=sourceEvent?eventPlanningContext(sourceEvent):undefined;
 const [step,setStep]=useState(1),[title,setTitle]=useState(()=>sourceEvent?Array.from(sourceEvent.title.trim()).slice(0,80).join(''):t('outings.defaultName')),[city,setCity]=useState(context?.city??'Bucuresti');
 const [days,setDays]=useState<string[]>(()=>[context?.outingDate??planningToday()]),[friends,setFriends]=useState<string[]>([]),[search,setSearch]=useState(''),[submitted,setSubmitted]=useState(false);
 const [deadline,setDeadline]=useState(()=>defaultDecisionAt([context?.outingDate??planningToday()])),[deadlineOpen,setDeadlineOpen]=useState(false),[infoOpen,setInfoOpen]=useState(false);
 useEffect(()=>{void model.store.loadFriends();},[model.store]);
 const dayInvalid=days.some(day=>!validPlanningDate(day))||new Set(days).size!==days.length;
 const setupValid=(!sourceEvent||!!context)&&title.trim().length>0&&Array.from(title.trim()).length<=80&&!dayInvalid&&eventCities.includes(city)&&Date.parse(deadline)>Date.now();
 const next=()=>{setSubmitted(true);if(setupValid){setSubmitted(false);setStep(2);}};
 const create=async()=>{if(model.working)return;setSubmitted(true);if(!setupValid||!days.every(day=>canCreatePlan(title,day,city,friends))){if(!setupValid)setStep(1);return;}const draft=sourceEvent?eventPlanDraft(sourceEvent,title,friends):{title:title.trim(),candidateDates:days,city,friendIds:friends};if(!draft)return;const p=await model.store.createPlan({...draft,decisionAt:deadline});if(p)onCreated(p.id);};
 const visible=model.friends.filter(f=>f.username.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 return <form className={s.builder} onSubmit={event=>{event.preventDefault();if(step===1)next();else void create();}} noValidate>
  <div className={s.split}><span className={s.muted}>{t('outings.plan.step',{step})}</span><span className={s.builderProgress} aria-hidden>{[1,2].map(n=><span key={n} data-active={n<=step}/>)}</span></div>
  {step===1?<>
   <div className={s.stackCompact}><h2>{t('outings.plan.setup')}</h2><p className={s.muted}>{t('outings.plan.setupHint')}</p></div>
   <Field label={t('outings.planName')} error={submitted&&!title.trim()?t('outings.ui.invalidTitle'):undefined}><Input data-testid="outing-title" value={title} maxLength={80} autoComplete="off" placeholder={t('outings.plan.nameHint')} onChange={event=>setTitle(event.target.value)}/></Field>
   <Field label={t('outings.city')}><ThemedSelect testId="outing-city" disabled={!!sourceEvent} value={city} onChange={setCity} placeholder={t('outings.city')} options={eventCities.map(value=>({value,label:value}))}/></Field>
   <div className={s.stackCompact}><div className={s.split}><span className={s.builderLabel}>{t('outings.plan.selectedNights')}</span><span className={s.nightTools}><span className={s.muted}>{days.length}/3</span><button type="button" className={s.builderInfo} aria-label={t('outings.plan.moreInfo')} onClick={()=>setInfoOpen(true)}><Info size={17}/></button></span></div>
    <div className={s.dayCards}>{days.map((day,index)=><div key={index} className={s.dayCardColumn}><label className={s.dayCard}>
     <strong>{outingDate(day,i18n.language,'day')}</strong><span>{new Intl.DateTimeFormat(i18n.language,{weekday:'short',timeZone:'UTC'}).format(new Date(day+'T12:00Z'))} · {outingDate(day,i18n.language,'month')}</span>
     <input type="date" disabled={!!sourceEvent} aria-label={t('outings.plan.nightLabel',{number:index+1})} min={planningToday()} max={shiftCalendarDay(planningToday(),365)} value={day} onChange={event=>{if(event.target.value)setDays(rows=>rows.map((old,i)=>i===index?event.target.value:old));}}/>
    </label>{days.length>1&&<button className={s.removeDay} type="button" aria-label={t('outings.plan.removeNight')+' '+outingDate(day,i18n.language)} onClick={()=>setDays(rows=>rows.filter((_,i)=>i!==index))}><X size={15}/></button>}</div>)}
    {!sourceEvent&&days.length<3&&<button type="button" className={s.addDay} aria-label={t('outings.plan.addNight')} onClick={()=>setDays(rows=>[...rows,shiftCalendarDay([...rows].sort().at(-1)!,1)])}><Plus size={22}/></button>}
    </div>
    {submitted&&dayInvalid&&<p className={s.error} role="alert">{t('outings.ui.invalidDate')}</p>}
   </div>
   <button type="button" className={s.deadlineButton} onClick={()=>setDeadlineOpen(true)}><Clock size={17}/><span><small>{t('outings.plan.deadlineShort')}</small><strong>{new Intl.DateTimeFormat(i18n.language,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(deadline))}</strong></span><ChevronRight size={17}/></button>
   {submitted&&Date.parse(deadline)<=Date.now()&&<p className={s.error} role="alert">{t('outings.plan.invalidDeadline')}</p>}
   <ActionButton data-testid="outing-next" type="submit" className="w-full">{t('outings.plan.next')}<ArrowRight size={17}/></ActionButton>
  </>:<>
   <div className={s.stackCompact}><h2>{t('outings.plan.people')}</h2><p className={s.muted}>{t('outings.plan.peopleHint')}</p></div><div className={s.draftSummary}><DateBlock day={days[0]}/><div><strong>{title}</strong><p className={s.meta}>{city} · {days.map(day=>outingDate(day,i18n.language)).join(' / ')}</p></div></div>
   <Input data-testid="outing-friend-search" type="search" aria-label={t('outings.ui.searchFriends')} placeholder={t('outings.ui.searchFriends')} value={search} onChange={event=>setSearch(event.target.value)}/>
   <div className={s.builderFriends}>{visible.map(friend=>{const checked=friends.includes(friend.id);return <label className={s.builderFriend} data-selected={checked} key={friend.id}><MemberAvatar name={friend.username} userId={friend.id} uri={friend.avatarUrl}/><strong>{friend.username}</strong><input type="checkbox" aria-label={friend.username} checked={checked} disabled={model.working||friends.length>=7&&!checked} onChange={()=>setFriends(rows=>checked?rows.filter(id=>id!==friend.id):[...rows,friend.id])}/><span className={s.friendCheck} aria-hidden>{checked&&<Check size={15}/>}</span></label>;})}
    {!model.catalogPending&&!model.friendsError&&!visible.length&&<p className={s.muted}>{t(model.friends.length?'outings.ui.noFriendResults':'outings.noFriends')}</p>}
   </div>
   {model.catalogPending&&<p role="status" className={s.muted}>{t('common.loading')}</p>}{!!model.friendsError&&<div className={s.stackCompact}><p className={s.error} role="alert">{t(model.friendsError)}</p><ActionButton tone="secondary" busy={model.catalogPending} onClick={()=>void model.store.loadFriends()}>{t('common.retry')}</ActionButton></div>}
   <p role={submitted&&!friends.length?'alert':'status'} className={submitted&&!friends.length?s.error:s.muted}>{t(submitted&&!friends.length?'outings.ui.invalidFriends':'outings.ui.selected',{count:friends.length})}</p>
   <ActionButton data-testid="outing-create" type="submit" busy={model.working} className="w-full">{t('outings.create')}</ActionButton>
  </>}
  <ActionButton tone="ghost" disabled={model.working} onClick={()=>step===1?onCancel():setStep(1)}>{t(step===1?'common.cancel':'common.back')}</ActionButton>
  <ModalFrame open={deadlineOpen} onClose={()=>setDeadlineOpen(false)} label={t('outings.plan.deadlineShort')}><ModalHeader title={t('outings.plan.deadlineShort')} onClose={()=>setDeadlineOpen(false)}/><div className="space-y-5 p-6"><Field label={t('outings.plan.deadline')}><Input type="datetime-local" value={new Date(Date.parse(deadline)-new Date(deadline).getTimezoneOffset()*60000).toISOString().slice(0,16)} onChange={event=>{if(event.target.value)setDeadline(new Date(event.target.value).toISOString());}}/></Field><p className={s.muted}>{t('outings.plan.deadlineHint')}</p><ActionButton onClick={()=>setDeadlineOpen(false)}>{t('datePicker.done')}</ActionButton></div></ModalFrame>
  <ModalFrame open={infoOpen} onClose={()=>setInfoOpen(false)} label={t('outings.plan.moreInfo')}><ModalHeader title={t('outings.plan.moreInfo')} onClose={()=>setInfoOpen(false)}/><p className="p-6">{t('outings.plan.nightHint')}</p></ModalFrame>
 </form>;
}
