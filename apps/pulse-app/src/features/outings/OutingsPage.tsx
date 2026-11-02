"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { isOutingId } from '@packages/app-core/outings/model';
import { ActionButton } from '@/components/ui/ActionButton';
import { useOutings } from './useOutings';
import { OutingPlanBuilder } from './OutingPlanBuilder';
import { OutingPlanDetails } from './OutingPlanDetails';
import { SuggestForOuting } from './SuggestForOuting';
import { useDataProvider } from '@/core/DataProviderContext';

export default function OutingsPage() {
  const {user}=useDataProvider(),params=useSearchParams(),router=useRouter();
  const legacy=params.has('ticket')||params.get('tab')==='transfers';
  useEffect(()=>{
    if(legacy){const ticket=params.get('ticket');router.replace('/ticket-transfers'+(isOutingId(ticket)?'?ticket='+ticket:''));}
  },[legacy,params,router]);
  return legacy?null:<OutingsContent key={(user?.properties.id??'guest')+':'+params.toString()}/>;
}
function OutingsContent() {
  const model=useOutings(),{t}=useTranslation(),params=useSearchParams();
  const planId=params.get('plan'),eventId=params.get('event');
  const [selected,setSelected]=useState(isOutingId(planId)?planId:''),[building,setBuilding]=useState(false);
  useEffect(()=>{if(selected&&!model.pending)void model.store.loadPlan(selected);},[selected,model.pending,model.store]);
  const plan=model.plans.find(item=>item.id===selected);
  return <main data-testid="outings-screen" className="mx-auto w-full max-w-3xl space-y-6 px-5 pt-6 pb-32">
    <Link href="/users/me" className="inline-flex min-h-11 items-center text-muted-foreground">← {t('common.back')}</Link>
    <header className="space-y-2"><h1 className="text-3xl font-bold">{t('outings.title')}</h1><p className="text-muted-foreground">{t('outings.hint')}</p></header>
    {!model.user?<Link href="/login" className="text-primary underline">{t('nav.profile')}</Link>:<>
      {model.error&&<p role="alert" className="text-destructive">{t(model.error)}</p>}{model.notice&&<p role="status">{t(model.notice)}</p>}
      {model.pending?<p role="status">{t('common.loading')}</p>:building?
        <OutingPlanBuilder model={model} onCreated={id=>{setBuilding(false);setSelected(id);}} onCancel={()=>setBuilding(false)}/>:
        plan?<><ActionButton tone="ghost" onClick={()=>setSelected('')}>{t('outings.plans')}</ActionButton><OutingPlanDetails plan={plan} model={model}/></>:
        <div className="space-y-4">
          {isOutingId(eventId)&&<SuggestForOuting eventId={eventId} model={model} onProposed={setSelected}/>}
          <ActionButton data-testid="outing-new" onClick={()=>setBuilding(true)}>{t('outings.newPlan')}</ActionButton>
          {!model.plans.length&&<p className="text-muted-foreground">{t('outings.empty')}</p>}
          {model.plans.map(item=><ActionButton key={item.id} tone="secondary" className="w-full" onClick={()=>setSelected(item.id)}>{[item.title,item.outingDate,item.city].filter(Boolean).join(' · ')}</ActionButton>)}
        </div>}
      <ActionButton tone="ghost" busy={model.refreshing} disabled={model.working} onClick={()=>void model.store.load()}>{t('outings.refresh')}</ActionButton>
    </>}
  </main>;
}
