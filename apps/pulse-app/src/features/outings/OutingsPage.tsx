"use client";
import { useEffect,useRef,useState } from 'react';
import { ArrowLeft,LockKeyhole,Plus,RefreshCw } from 'lucide-react';
import { useRouter,useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { isOutingId } from '@packages/app-core/outings/model';
import { ActionButton,ActionLink,IconButton } from '@/components/ui/ActionButton';
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
  const [selected,setSelected]=useState(isOutingId(planId)?planId:''),[building,setBuilding]=useState(false);
  useEffect(()=>{if(selected&&!model.pending)void model.store.loadPlan(selected);},[selected,model.pending,model.store]);
  useEffect(()=>{root.current?.querySelector<HTMLElement>('h1')?.focus();},[selected,building]);
  const plan=model.plans.find(item=>item.id===selected);
  const invitations=model.plans.filter(item=>item.status==='pending'),mine=model.plans.filter(item=>item.status==='accepted');
  const back=()=>building?setBuilding(false):setSelected('');
  const create=<ActionButton data-testid="outing-new" onClick={()=>setBuilding(true)}><Plus size={18} aria-hidden/>{t('outings.newPlan')}</ActionButton>;
  return <main ref={root} data-testid="outings-screen" className={s.page}>
    <div className={s.toolbar}>
      {building||selected?<ActionButton tone="ghost" disabled={model.working} onClick={back}><ArrowLeft size={18} aria-hidden/>{t('common.back')}</ActionButton>:
        <ActionLink href="/users/me" tone="ghost"><ArrowLeft size={18} aria-hidden/>{t('common.back')}</ActionLink>}
      {model.user&&<IconButton label={t('outings.ui.refreshHint')} busy={model.refreshing} disabled={model.working} onClick={()=>void model.store.load()}>{!model.refreshing&&<RefreshCw size={18} aria-hidden/>}</IconButton>}
    </div>
    {(!plan||building)&&<header className={s.listHeader}>
      <div className={s.hero} style={{margin:0}}>
        <p className={s.eyebrow}><LockKeyhole size={14} aria-hidden/>{t('outings.ui.private')}</p>
        <h1 tabIndex={-1} className={s.title}>{t(building?'outings.newPlan':'outings.title')}</h1>
        <p className={s.description}>{t(building?'outings.ui.detailHint':'outings.hint')}</p>
      </div>
      {!building&&model.user&&model.plans.length>0&&create}
    </header>}
    <p className="sr-only" role="status">{model.notice?t(model.notice):''}</p>
    {model.error&&<div style={{marginBottom:24}}><StatusNotice kind="error" title={t(model.error)} action={()=>void model.store.load()} actionLabel={t('common.retry')}/></div>}
    {!model.ready||model.user&&model.pending?<div className={s.stack} aria-busy="true" role="status" aria-label={t('common.loading')}><div className={s.skeleton}/><div className={s.skeleton}/></div>:
      !model.user?<OutingEmpty title={t('outings.ui.emptyTitle')} detail={t('outings.ui.emptyHint')}><ActionLink href="/login">{t('nav.profile')}</ActionLink></OutingEmpty>:
      model.error&&!model.plans.length&&!building&&!selected?null:building?<OutingPlanBuilder model={model} onCreated={id=>{setBuilding(false);setSelected(id);}} onCancel={()=>setBuilding(false)}/>:
      plan?<OutingPlanDetails plan={plan} model={model}/>:
      <div className={s.stack}>
        {isOutingId(eventId)&&<div className={s.section}><SuggestForOuting eventId={eventId} model={model} onProposed={setSelected}/></div>}
        {invitations.length>0&&<section><div className={s.sectionHeader}><h2>{t('outings.ui.invitations')}</h2><span className={s.pill}>{invitations.length}</span></div><div className={s.planGrid}>{invitations.map(item=><PlanCard key={item.id} plan={item} onOpen={()=>setSelected(item.id)} disabled={model.working}/>)}</div></section>}
        {mine.length>0&&<section><div className={s.sectionHeader}><h2>{t('outings.ui.yourOutings')}</h2><span className={s.pill}>{mine.length}</span></div><div className={s.planGrid}>{mine.map(item=><PlanCard key={item.id} plan={item} onOpen={()=>setSelected(item.id)} disabled={model.working}/>)}</div></section>}
        {!model.plans.length&&<OutingEmpty title={t('outings.ui.emptyTitle')} detail={t('outings.ui.emptyHint')}>{create}</OutingEmpty>}
      </div>}
  </main>;
}
