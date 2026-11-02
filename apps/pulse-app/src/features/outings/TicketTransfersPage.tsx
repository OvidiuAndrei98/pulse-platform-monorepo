"use client";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { isOutingId } from '@packages/app-core/outings/model';
import { useDataProvider } from '@/core/DataProviderContext';
import { ActionButton } from '@/components/ui/ActionButton';
import { TicketTransfers } from './TicketTransfers';
import { useOutings } from './useOutings';

export default function TicketTransfersPage() {
  const {user}=useDataProvider(),params=useSearchParams();
  return <Transfers key={(user?.properties.id??'guest')+':'+params.toString()}/>;
}
function Transfers() {
  const model=useOutings('transfers'),{t}=useTranslation(),params=useSearchParams(),ticket=params.get('ticket');
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-5 pt-6 pb-32">
    <Link href="/users/me" className="inline-flex min-h-11 items-center text-muted-foreground">← {t('common.back')}</Link>
    <h1 className="text-3xl font-bold">{t('outings.transfers')}</h1>
    {!model.user?<Link href="/login" className="text-primary underline">{t('nav.profile')}</Link>:<>
      {model.error&&<p role="alert" className="text-destructive">{t(model.error)}</p>}{model.notice&&<p role="status">{t(model.notice)}</p>}
      {model.pending?<p role="status">{t('common.loading')}</p>:<TicketTransfers model={model} initialTicketId={isOutingId(ticket)?ticket:undefined}/>}
      <ActionButton tone="ghost" busy={model.refreshing} disabled={model.working} onClick={()=>void model.store.load()}>{t('outings.refresh')}</ActionButton>
    </>}
  </main>;
}
