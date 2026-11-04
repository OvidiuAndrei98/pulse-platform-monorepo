"use client";
import { useEffect,useRef,useState } from 'react';
import { ArrowLeft,LockKeyhole,Plus } from 'lucide-react';
import { useRouter,useSearchParams } from 'next/navigation';
import { useHydratedTranslation as useTranslation } from '@/lib/useHydratedTranslation';
import { isOutingId } from '@packages/app-core/outings/model';
import { ActionButton,ActionLink } from '@/components/ui/ActionButton';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { useDataProvider } from '@/core/DataProviderContext';
import { useOutings } from './useOutings';
import { OutingPlanBuilder } from './OutingPlanBuilder';
import { OutingPlanDetails } from './OutingPlanDetails';
import { SuggestForOuting } from './SuggestForOuting';
import { OutingEmpty,PlanCard } from './OutingPrimitives';
import s from './outings.module.css';

export default function OutingsPage() {
  const {user}=useDataProvider(),params=useSearchParams(),router=useRouter();
  const legacy=params.has('ticket')||params.get('tab')==='transfers';
  useEffect(()=>{
    if(legacy){const ticket=params.get('ticket');router.replace('/ticket-transfers'+(isOutingId(ticket)?'?ticket='+ticket:''));}
  },[legacy,params,router]);
  return legacy?null:<OutingsContent key={(user?.properties.id??'guest')+':'+params.toString()}/>;
}
function OutingsContent() {
  const model=useOutings(),{t}=useTranslation(),params=useSearchParams(),root=useRef<HTMLElement>(null);
  const planId=params.get('plan'),eventId=params.get('event');
  const [selected,setSelected]=useState(isOutingId(planId)?planId:''),[building,setBuilding]=useState(params.get('new')==='1');
  useEffect(()=>{if(selected&&!model.pending)void model.store.loadPlan(selected);},[selected,model.pending,model.store]);
  useEffect(()=>{root.current?.querySelector<HTMLElement>('h1')?.focus();},[selected,building]);
  const plan=model.plans.find(item=>item.id===selected);
  const invitations=model.plans.filter(item=>item.status==='pending'),mine=model.plans.filter(item=>item.status==='accepted');
  const back=()=>building?setBuilding(false):setSelected('');
  const create=<ActionButton data-testid="outing-new" onClick={()=>setBuilding(true)}><Plus size={18} aria-hidden/>{t('outings.newPlan')}</ActionButton>;
  return <main ref={root} data-testid="outings-screen" className={s.page}>
    <header className={s.navigationBar}>
      {building||selected?<ActionButton className={s.navigationCircle} tone="secondary" aria-label={t('common.back')} disabled={model.working} onClick={back}><ArrowLeft size={20}/></ActionButton>:<ActionLink className={s.navigationCircle} tone="secondary" aria-label={t('common.back')} href="/friends"><ArrowLeft size={20}/></ActionLink>}
      {!plan?<h1 tabIndex={-1} className={building?s.navigationLabel:s.navigationTitle}>{t(building?'outings.newPlan':'outings.title')}</h1>:<span className={s.navigationLabel}>{t('outings.title')}</span>}
      {!building&&!plan&&model.user&&model.plans.length>0&&<ActionButton className={s.navigationCircle} data-testid="outing-new" aria-label={t('outings.newPlan')} onClick={()=>setBuilding(true)}><Plus size={20}/></ActionButton>}
    </header>
    <p className="sr-only" role="status">{model.notice?t(model.notice):''}</p>
    {model.error&&<div style={{marginBottom:24}}><StatusNotice kind="error" title={t(model.error)} action={()=>void model.store.load()} actionLabel={t('common.retry')}/></div>}
    {!model.ready||model.user&&model.pending?<div className={s.stack} aria-busy="true" role="status" aria-label={t('common.loading')}><div className={s.skeleton}/><div className={s.skeleton}/></div>:
      !model.user?<OutingEmpty title={t('outings.ui.emptyTitle')} detail={t('outings.ui.emptyHint')}><ActionLink href="/login">{t('nav.profile')}</ActionLink></OutingEmpty>:
      model.error&&!model.plans.length&&!building&&!selected?null:building?<OutingPlanBuilder model={model} onCreated={id=>{setBuilding(false);setSelected(id);}} onCancel={()=>setBuilding(false)}/>:
      plan?<OutingPlanDetails key={plan.id} plan={plan} model={model}/>:
      <div className={s.stack}>
        {isOutingId(eventId)&&<div className={s.section}><SuggestForOuting eventId={eventId} model={model} onProposed={setSelected}/></div>}
        {invitations.length>0&&<section><div className={s.sectionHeader}><h2>{t('outings.ui.invitations')}</h2><span className={s.pill}>{invitations.length}</span></div><div className={s.planGrid}>{invitations.map(item=><PlanCard key={item.id} plan={item} onOpen={()=>setSelected(item.id)} disabled={model.working}/>)}</div></section>}
        {mine.length>0&&<section><div className={s.sectionHeader}><h2>{t('outings.ui.yourOutings')}</h2><span className={s.pill}>{mine.length}</span></div><div className={s.planGrid}>{mine.map(item=><PlanCard key={item.id} plan={item} onOpen={()=>setSelected(item.id)} disabled={model.working}/>)}</div></section>}
        {!model.plans.length&&<OutingEmpty title={t('outings.ui.emptyTitle')} detail={t('outings.ui.emptyHint')}>{create}</OutingEmpty>}
      </div>}
  </main>;
}
