"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ActionButton } from '@/components/ui/ActionButton';
import { WardrobeTabs as SectionTabs } from '@/features/wardrobe/WardrobeTabs';
import { useOutings } from './useOutings';
import { OutingPlanBuilder } from './OutingPlanBuilder';
import { OutingPlanDetails } from './OutingPlanDetails';
import { TicketTransfers } from './TicketTransfers';
import { useDataProvider } from '@/core/DataProviderContext';

export default function OutingsPage() {
  const {user}=useDataProvider();return <OutingsContent key={user?.properties.id??'guest'}/>;
}
function OutingsContent() {
  const model=useOutings(),{t,i18n}=useTranslation(),params=useSearchParams(),ticketId=params.get('ticket')??undefined;
  const [tab,setTab]=useState<'plans'|'transfers'>(ticketId||params.get('tab')==='transfers'?'transfers':'plans'),[selected,setSelected]=useState(params.get('plan')??''),[building,setBuilding]=useState(false);
  const plan=model.plans.find(p=>p.id===selected);
  return <main data-testid="outings-screen" className="mx-auto w-full max-w-3xl space-y-6 px-5 pt-6 pb-32">
    <Link href="/users/me" className="inline-flex min-h-11 items-center text-sm text-muted-foreground">← {t('common.back')}</Link>
    <header className="space-y-2"><h1 className="text-3xl font-bold">{t('outings.title')}</h1><p className="text-muted-foreground">{t('outings.hint')}</p></header>
    {!model.user?<Link href="/login" className="text-primary underline">{t('nav.profile')}</Link>:<>
      <SectionTabs id="outings-tabs" panelId="outings-panel" label={t('outings.title')} value={tab} onChange={setTab} disabled={model.working} ro={i18n.language.startsWith('ro')} options={[{value:'plans',label:t('outings.plans')},{value:'transfers',label:t('outings.transfers')}]}/>
      {model.error&&<p role="alert" className="text-destructive">{t(model.error)}</p>}{model.notice&&<p role="status">{t(model.notice)}</p>}
      <div id="outings-panel" role="tabpanel" aria-labelledby={'outings-tabs-'+tab}>
        {model.pending?<p role="status">{t('common.loading')}</p>:tab==='transfers'?<TicketTransfers model={model} initialTicketId={ticketId}/>
          :building?<OutingPlanBuilder model={model} onCreated={id=>{setBuilding(false);setSelected(id);}} onCancel={()=>setBuilding(false)}/>
          :plan?<><ActionButton tone="ghost" onClick={()=>setSelected('')}>{t('outings.plans')}</ActionButton><OutingPlanDetails plan={plan} model={model}/></>
          :<div className="space-y-4"><ActionButton data-testid="outing-new" onClick={()=>setBuilding(true)}>{t('outings.newPlan')}</ActionButton>{!model.plans.length&&<p className="text-muted-foreground">{t('outings.empty')}</p>}{model.plans.map(p=><ActionButton key={p.id} tone="secondary" className="w-full" onClick={()=>setSelected(p.id)}>{p.title} · {t('outings.'+p.status)}</ActionButton>)}</div>}
      </div>
      <ActionButton tone="ghost" busy={model.refreshing} disabled={model.working} onClick={()=>void model.store.load()}>{t('outings.refresh')}</ActionButton>
    </>}
  </main>;
}
