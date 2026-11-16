"use client";
import {useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslation} from 'react-i18next';
import {type FriendGroup} from '@packages/app-core/social/groups';
import {planningToday,validPlanningDate,matchesPlanningContext,type OutingPlan,type PlanEvent} from '@packages/app-core/outings/model';
import {shiftCalendarDay} from '@packages/app-core/events/discoveryFilters';
import type {EventFilters} from '@packages/app-core/events/types';
import {useMotionValue} from 'framer-motion';
import {eventCities} from '@packages/app-core/events/constants';
import {ActionButton,ActionLink} from '@/components/ui/ActionButton';
import {Field} from '@/components/ui/Field';
import {GroupSheet} from './GroupSheet';
import {EventPreview} from './EventPreview';
import {ActionMenu} from './ActionMenu';
import {MoreHorizontal} from 'lucide-react';
import {ThemedSelect} from '@/features/events/form/ThemedSelect';
import {formatGroupEventDateTime as formatEventDateTime} from './dateFormat';
import {DiscoveryDateRibbon} from '@/features/events/filters/DiscoveryDateRibbon';
import {useGroups} from './useGroups';
import s from './groups.module.css';
type Model=ReturnType<typeof useGroups>;
export type NightDraft={dates:string[];city:string;poll:boolean;selectedEvent:PlanEvent|null};
function NightRibbon({value,onChange,label,index,city,commitSelectionRef}:{value:string;onChange:(day:string)=>void;label:string;index:number;city:string;commitSelectionRef:RefObject<(()=>string)|null>}){
 const {t,i18n}=useTranslation(),[expanded,setExpanded]=useState(true),progress=useMotionValue(1),source=useRef<HTMLSpanElement>(null),minimum=planningToday(),past=value<minimum;
 const filters=useMemo<EventFilters>(()=>({categories:[],vibes:[],date:'Custom',dateFrom:value,dateTo:value,distance:0,city}),[value,city]);
 const selectedLabel=new Intl.DateTimeFormat(i18n.language.startsWith('ro')?'ro-RO':'en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 return <div className={s.stack} style={{gap:8}} data-testid={'group-night-selector-'+index}><div className={s.sectionHead}><span className="ui-field-label">{label}</span><span className={s.muted} data-testid="group-night-draft-date">{selectedLabel}</span></div>{past?<><p className={s.muted}>{t('groups.pastNightHint')}</p><ActionButton data-testid="group-night-replace-past" tone="secondary" onClick={()=>onChange(minimum)}>{t('groups.chooseNewNight')}</ActionButton></>:<div style={{position:'relative',height:54}}><span ref={source} style={{display:'block',width:44,height:44,visibility:'hidden'}} aria-hidden/><DiscoveryDateRibbon filters={filters} onChange={next=>onChange(next.dateFrom||minimum)} minimumDay={minimum} maximumDay={shiftCalendarDay(minimum,365)} progress={progress} sourceRef={source} expanded={expanded} onOpenChange={setExpanded} commitOnPreview commitSelectionRef={commitSelectionRef}/></div>}</div>;
}
export function ProposeNight({group,model,onClose,plan,onSaved,initialDraft,onDraft,onChooseEvent,onFinish}:{group:FriendGroup;model:Model;onClose:()=>void;plan?:OutingPlan;onSaved?:()=>void;initialDraft?:NightDraft;onDraft?:(draft:NightDraft)=>void;onChooseEvent?:()=>void;onFinish?:()=>void}){
 const {t}=useTranslation(),router=useRouter();
 const [revision,setRevision]=useState(plan?.revision??0),[dates,setDates]=useState(()=>[initialDraft?.dates[0]??plan?.outingDate??plan?.candidateDates?.[0]?.date??planningToday()]);
 const poll=false,[city,setCity]=useState(initialDraft?.city??plan?.city??group.outings.find(p=>p.city)?.city??'');
 const [selectedEvent,setSelectedEvent]=useState<PlanEvent|null>(initialDraft?.selectedEvent??null),[eventReset,setEventReset]=useState(false),[saving,setSaving]=useState(false),active=useRef(true),saveGuard=useRef(false);
 const commitSelection=useRef<(()=>string)|null>(null),liveDraft=useRef<NightDraft>({dates,city,poll,selectedEvent});liveDraft.current={dates,city,poll,selectedEvent};
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 useEffect(()=>{onDraft?.({dates,city,poll,selectedEvent})},[dates,city,poll,selectedEvent,onDraft]);
 const close=()=>{active.current=false;model.store.resetContextFeedback();onClose()};
 const initial=useRef(JSON.stringify({city:plan?.city??'',dates:plan?.outingDate?[plan.outingDate]:plan?.candidateDates?.map(d=>d.date)??[],poll:!plan?.outingDate&&!!plan?.candidateDates&&plan.candidateDates.length>1}));
 const unchanged=!!plan&&initial.current===JSON.stringify({city,dates,poll});
 const existing=!plan&&dates.length===1?group.outings.find(outing=>outing.outingDate===dates[0]&&!['completed','cancelled'].includes(outing.lifecycle??'')):undefined;
 const canAddSelected=!!existing&&!!selectedEvent&&matchesPlanningContext(selectedEvent,existing);
 const valid=!!city&&dates.every(day=>validPlanningDate(day))&&new Set(dates).size===dates.length&&(!selectedEvent||matchesPlanningContext(selectedEvent,{outingDate:dates.length===1?dates[0]:undefined,city}));
 useEffect(()=>{model.store.resetContextFeedback();return()=>model.store.resetContextFeedback()},[model.store]);
 const revise=(nextDates=dates,nextCity=city)=>{model.store.resetContextFeedback();let event=liveDraft.current.selectedEvent;if(event&&!matchesPlanningContext(event,{outingDate:nextDates.length===1?nextDates[0]:undefined,city:nextCity})){event=null;setSelectedEvent(null);setEventReset(true)}liveDraft.current={dates:nextDates,city:nextCity,poll,selectedEvent:event};onDraft?.(liveDraft.current)};
 const chooseEvent=()=>{commitSelection.current?.();onDraft?.(liveDraft.current);onChooseEvent?.()};
 const save=async()=>{if(saveGuard.current)return;commitSelection.current?.();const {dates,city,selectedEvent}=liveDraft.current;if(!city||!dates.every(day=>validPlanningDate(day))||plan&&initial.current===JSON.stringify({city,dates,poll}))return;const existing=!plan?group.outings.find(outing=>outing.outingDate===dates[0]&&!['completed','cancelled'].includes(outing.lifecycle??'')):undefined,canAddSelected=!!existing&&!!selectedEvent&&matchesPlanningContext(selectedEvent,existing);saveGuard.current=true;setSaving(true);try{
  if(existing){if(selectedEvent&&canAddSelected&&!existing.options.some(option=>option.eventId===selectedEvent.id)){const proposed=await model.store.planAction(group.id,existing.id,'proposals',{eventId:selectedEvent.id,revision:existing.revision});if(!proposed)return}if(!active.current)return;onFinish?.();router.replace('/groups/'+group.id+'/outings/'+existing.id);return}
  const draft={city,...(poll&&dates.length>1?{dates}:{date:dates[0]})};
  const result=plan?await model.store.editContext(group.id,plan.id,{...draft,revision,confirmImpact:!!model.contextImpact}):await model.store.createOuting(group.id,selectedEvent?{eventId:selectedEvent.id}:draft);
  if(result&&active.current){if(plan){if(onSaved)onSaved();else close()}else{if(selectedEvent&&result.chosenEventId!==selectedEvent.id&&!result.options.some(option=>option.eventId===selectedEvent.id)){const proposed=await model.store.planAction(group.id,result.id,'proposals',{eventId:selectedEvent.id,revision:result.revision});if(!proposed||!active.current)return}onFinish?.();router.replace('/groups/'+group.id+'/outings/'+result.id)}}
 }finally{saveGuard.current=false;if(active.current)setSaving(false)}};
 const impact=model.contextImpact;

 return <GroupSheet onClose={close} testId="group-night-editor" title={t(plan?'groups.editNight':'groups.propose')} busy={saving} footer={<ActionButton data-testid="group-night-submit" busy={saving} disabled={!valid||unchanged} onClick={()=>void save()}>{t(plan?impact?'groups.confirmContextChange':'groups.save':existing?canAddSelected?'groups.addToExistingOuting':'groups.openExistingOuting':'groups.propose')}</ActionButton>}>
 {dates.map((day,index)=><NightRibbon key={index} value={day} city={city} label={t('groups.day')+(poll?' '+(index+1):'')} index={index} commitSelectionRef={commitSelection} onChange={day=>{const next=liveDraft.current.dates.map((value,n)=>n===index?day:value);revise(next,liveDraft.current.city);setDates(next)}}/>)}
 <Field label={t('groups.city')}><ThemedSelect testId="group-night-city" value={city} onChange={value=>{revise(dates,value);setCity(value)}} options={eventCities.map(value=>({value,label:value}))} placeholder={t('groups.city')}/></Field>
 {!plan&&dates.length===1&&<section className={s.stack} style={{gap:10}}>{selectedEvent?<EventPreview title={selectedEvent.title} startTime={selectedEvent.startTime} imageUrl={selectedEvent.bannerUrl} location={selectedEvent.locationName} action={<ActionMenu testId="group-night-event-menu" label={t('groups.selectedEvent')} icon={<MoreHorizontal size={19}/>} items={[{key:'change',testId:'group-night-choose-event',label:t('groups.resetChosenEvent'),onSelect:chooseEvent},{key:'remove',label:t('groups.remove'),destructive:true,onSelect:()=>setSelectedEvent(null)}]}/>}/>:<ActionButton data-testid="group-night-choose-event" tone="secondary" disabled={!valid} onClick={chooseEvent}>{t('groups.chooseEventOptional')}</ActionButton>}</section>}
 {eventReset&&dates.length===1&&<p className={s.muted} role="status">{t('groups.noCompatibleProposals')}</p>}
 {existing&&<p data-testid="group-night-existing-outing" className={s.muted} role="status">{t(canAddSelected?'groups.existingOutingHint':'groups.contextConflict')}</p>}
 {plan&&impact&&<section data-testid="group-context-impact" className={s.existingGroup} role="status"><strong>{t('groups.confirmContextChange')}</strong><p className={s.muted}>{t('groups.contextImpact')}</p><p className={s.muted}>{t('groups.contextImpactCounts',{availability:impact.availabilityResponses,eventPreferences:impact.eventPreferences,attendance:impact.attendanceResponses,kept:impact.proposalsKept,incompatible:impact.proposalsIncompatible})}</p>{impact.destinationCleared&&<p className={s.muted}>{t('groups.destinationWillClear')}</p>}</section>}
 {model.contextError&&<p role="alert" className={s.error}>{t(model.contextError)}</p>}
 {plan&&model.contextError==='groups.contextStale'&&<ActionButton tone="secondary" onClick={()=>void model.store.loadPlan(group.id,plan.id).then(()=>{const fresh=model.store.getSnapshot().groups.find(g=>g.id===group.id)?.outings.find(p=>p.id===plan.id);if(fresh){setRevision(fresh.revision??0);model.store.resetContextFeedback()}})}>{t('groups.contextRefresh')}</ActionButton>}
 {plan&&model.contextConflict&&<div className={s.stack}><p className={s.muted}>{t('groups.contextConflict')}</p><ActionLink data-testid="group-context-open-existing" tone="secondary" href={'/groups/'+group.id+'/outings/'+model.contextConflict}>{t('groups.openExistingOuting')}</ActionLink></div>}
 {!plan&&model.error&&<p role="alert" className={s.error}>{t(model.error)}</p>}
</GroupSheet>;
}
