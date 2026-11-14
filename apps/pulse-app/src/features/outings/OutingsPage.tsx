"use client";
import {useEffect} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {useTranslation} from 'react-i18next';
import {isOutingId} from '@packages/app-core/outings/model';
import {useOutings} from './useOutings';
import {ActionLink} from '@/components/ui/ActionButton';
import {StatusNotice} from '@/components/ui/StatusNotice';
import s from '../groups/groups.module.css';
/** Compatibility access only: historical plans are never turned into groups. */
export default function OutingsPage(){
 const params=useSearchParams(),router=useRouter(),{t}=useTranslation(),model=useOutings(),id=params.get('plan'),event=params.get('event'),ticket=params.get('ticket');
 useEffect(()=>{
  if(params.get('tab')==='transfers'||isOutingId(ticket)){router.replace('/ticket-transfers'+(isOutingId(ticket)?'?ticket='+ticket:''));return}
  if(isOutingId(event)||params.get('new')==='1'){router.replace('/groups'+(isOutingId(event)?'?event='+event:'?new=1'));return}
  if(isOutingId(id))void model.store.loadPlan(id);
 },[params,id,event,ticket,model.store,router]);
 const plan=model.plans.find(p=>p.id===id);
 useEffect(()=>{if(plan?.groupId)router.replace('/groups/'+plan.groupId+'/outings/'+plan.id)},[plan,router]);
 return <main className={s.page}><ActionLink href="/friends" tone="secondary">{t('common.back')}</ActionLink><h1>{t('groups.legacyPlans')}</h1><p className={s.muted}>{t('groups.legacyHint')}</p>{model.pending?<StatusNotice kind="loading" title={t('common.loading')}/>:model.error?<StatusNotice kind="error" title={t(model.error)}/>:plan?<div className={s.stack}><h2>{plan.title}</h2><p className={s.muted}>{plan.outingDate} · {plan.city}</p>{plan.options.map(e=><ActionLink tone="secondary" key={e.eventId} href={'/events/'+e.eventId}>{e.title}</ActionLink>)}</div>:model.plans.filter(p=>!p.groupId).map(p=><ActionLink tone="secondary" key={p.id} href={'/outings?plan='+p.id}>{p.title}</ActionLink>)}<ActionLink href="/groups">{t('groups.title')}</ActionLink></main>;
}
