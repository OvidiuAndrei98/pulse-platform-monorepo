"use client";
import { CalendarDays, Check, LockKeyhole, MapPin, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { outingDate, outingInitials, outingStage } from '@packages/app-core/outings/presentation';
import type { OutingPlan } from '@packages/app-core/outings/model';
import s from './outings.module.css';

export function MemberAvatar({name}:{name:string}){return <span className={s.avatar} aria-hidden="true">{outingInitials(name)}</span>;}
export function MemberStack({plan}:{plan:OutingPlan}){
  const {t}=useTranslation();
  return <div className={s.meta}><span className={s.people} aria-hidden="true">{plan.members.slice(0,3).map(member=><MemberAvatar key={member.userId} name={member.username}/>)}</span><span>{t('outings.ui.people',{count:plan.members.length})}</span></div>;
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
export function OutingProgress({plan}:{plan:OutingPlan}){
  const {t}=useTranslation(),active=outingStage(plan)==='ready'?2:plan.options.length?1:0;
  return <ol className={s.steps} aria-label={t('outings.ui.progress')}>{['ideas','voting','ready'].map((step,index)=><li key={step} data-active={index<=active} aria-current={index===active?'step':undefined}><span className={s.stepNumber}>{index<active?<Check size={14} aria-hidden/>:index+1}</span><span>{t('outings.ui.steps.'+step)}</span></li>)}</ol>;
}
export function PlanCard({plan,onOpen,disabled}:{plan:OutingPlan;onOpen:()=>void;disabled?:boolean}){
  const {t}=useTranslation(),stage=outingStage(plan),chosen=plan.options.find(option=>option.eventId===plan.chosenEventId);
  return <button type="button" className={s.planCard} onClick={onOpen} disabled={disabled} data-testid={'outing-card-'+plan.id}>
    <div className={s.cardTop}><span className={s.eyebrow} style={{margin:0}}><LockKeyhole size={13} aria-hidden/>{t('outings.ui.private')}</span><OutingBadge tone={stage==='ready'?'success':stage==='invited'?'warning':undefined}>{t('outings.ui.stage.'+stage)}</OutingBadge></div>
    <div className={s.cardMain}><DateBlock day={plan.outingDate}/><div><h3>{plan.title}</h3><OutingMeta plan={plan}/></div></div>
    {chosen&&<p className={s.muted}>{chosen.title}</p>}
    <div className={s.cardBottom}>{plan.status==='accepted'?<MemberStack plan={plan}/>:<span className={s.muted}>{t('outings.ui.invitationHint')}</span>}<span aria-hidden="true">↗</span></div>
  </button>;
}
export function OutingEmpty({title,detail,children}:{title:string;detail:string;children?:React.ReactNode}){
  return <div className={s.empty}><span className={s.emptyIcon}><UsersRound size={26} aria-hidden/></span><h2>{title}</h2><p className={s.muted}>{detail}</p>{children}</div>;
}
