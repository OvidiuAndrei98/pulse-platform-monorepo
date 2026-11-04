"use client";
import { useState } from 'react';
import { CalendarDays, Check, ChevronRight, LockKeyhole, MapPin, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { outingDate, outingInitials, outingStage, responseCount } from '@packages/app-core/outings/presentation';
import type { OutingPlan } from '@packages/app-core/outings/model';
import s from './outings.module.css';
import { ApiClient } from '@packages/api-client/client';
import { useDataProvider } from '@/core/DataProviderContext';
import type { PublicProfile } from '@/core/DataProvider';
import { useCachedClientQuery } from '@/lib/useCachedClientQuery';
import { readClientQuery } from '@/lib/clientQueryCache';
import { isOutingId } from '@packages/app-core/outings/model';

export function MemberAvatar({name,uri,userId}:{name:string;uri?:string;userId?:string}){
 const {user}=useDataProvider(),actor=user?.properties.id,id=isOutingId(userId)?userId.toLowerCase():undefined;
 const friend=id&&actor?readClientQuery<PublicProfile[]>('friends:'+actor)?.data?.find(friend=>friend.id===id):undefined;
 const known=uri?.trim()||(id===actor?user?.properties.avatarUrl:undefined)||friend?.avatarUrl;
 const profile=useCachedClientQuery<PublicProfile|null>(actor&&id&&!known?'public-profile:'+actor+':'+id:null,()=>ApiClient.instance.get('/profiles/{id}',{params:{path:{id:id!}}}),null,{staleTimeMs:60_000});
 const source=known||(profile.data&&profile.data.id===id?profile.data.avatarUrl:undefined),[failed,setFailed]=useState<string|null>(null);
 return <span className={s.avatar} aria-hidden="true" data-testid="outing-member-photo">{outingInitials(name)}{source&&failed!==source&&<img src={source} alt="" onError={()=>setFailed(source)}/>}</span>;
}
export function MemberStack({plan}:{plan:OutingPlan}){
  const {t}=useTranslation();
  return <div className={s.meta}><span className={s.people} aria-hidden="true">{plan.members.slice(0,3).map(member=><MemberAvatar key={member.userId} name={member.username} userId={member.userId} uri={member.avatarUrl}/>)}</span><span>{t('outings.ui.people',{count:plan.members.length})}</span></div>;
}
export function OutingBadge({children,tone}:{children:React.ReactNode;tone?:'success'|'warning'}){
  return <span className={s.pill} data-tone={tone}>{children}</span>;
}
export function DateBlock({day}:{day?:string}){
  const {i18n}=useTranslation();
  return <span className={s.dateBlock} aria-hidden="true"><strong>{outingDate(day,i18n.language,'day')||'—'}</strong><span>{outingDate(day,i18n.language,'month')}</span></span>;
}
export function OutingMeta({plan}:{plan:OutingPlan}){
  const {i18n}=useTranslation();
  return <div className={s.meta}>{plan.outingDate&&<span className={s.meta}><CalendarDays size={15} aria-hidden/>{outingDate(plan.outingDate,i18n.language)}</span>}{plan.city&&<span className={s.meta}><MapPin size={15} aria-hidden/>{plan.city}</span>}</div>;
}
export function OutingProgress({plan}:{plan:OutingPlan}) {
 const {t}=useTranslation(),active=plan.chosenEventId?2:plan.outingDate?1:0;
 return <ol className={s.phaseProgress} aria-label={t('outings.ui.progress')}>{['stepNight','stepEvent','stepReady'].map((step,index)=><li key={step} data-filled={index<=active} aria-current={index===active?'step':undefined}><span/>{t('outings.plan.'+step)}</li>)}</ol>;
}
export function PlanCard({plan,onOpen,disabled}:{plan:OutingPlan;onOpen:()=>void;disabled?:boolean}) {
 const {t,i18n}=useTranslation(),stage=outingStage(plan),members=plan.members.filter(m=>m.status==='accepted'),answered=responseCount(plan),chosen=plan.options.find(option=>option.eventId===plan.chosenEventId);
 const status=stage==='invited'?'invited':stage==='ready'?'statusReady':stage==='voting'?'statusVoting':'statusDates';
 return <button type="button" className={s.planRow} onClick={onOpen} disabled={disabled} data-testid={'outing-card-'+plan.id}>
  {plan.outingDate?<span className={s.planDate}><strong>{outingDate(plan.outingDate,i18n.language,'day')}</strong><span>{outingDate(plan.outingDate,i18n.language,'month')}</span></span>:<span className={s.planDate}><CalendarDays size={30}/></span>}
  <span className={s.planRowContent}><span className={s.planStatus} data-ready={stage==='ready'}><i/>{t('outings.plan.'+status)}</span><strong>{plan.title}</strong><span className={s.muted}>{plan.city}{chosen?' · '+chosen.title:''}</span>
   {plan.status==='accepted'&&<span className={s.planParticipants}><span className={s.people}>{members.slice(0,3).map(member=><MemberAvatar key={member.userId} name={member.username} userId={member.userId} uri={member.avatarUrl}/>)}</span><span>{stage==='ready'?t('outings.ui.people',{count:members.length}):t('outings.plan.replies',{answered,total:members.length})}</span></span>}
  </span><span className={s.cardChevron} aria-hidden><ChevronRight size={15}/></span>
 </button>;
}
export function OutingEmpty({title,detail,children}:{title:string;detail:string;children?:React.ReactNode}){
  return <div className={s.empty}><span className={s.emptyIcon}><UsersRound size={26} aria-hidden/></span><h2>{title}</h2><p className={s.muted}>{detail}</p>{children}</div>;
}
