"use client";
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { planVoteCount, type OutingPlan } from '@packages/app-core/outings/model';
import { ActionButton } from '@/components/ui/ActionButton';
import { routeForPlatform } from '@/lib/native/navigation';
import { formatEventDate, formatEventTime } from '@/features/events/dateFormat';
import type { useOutings } from './useOutings';

export function OutingPlanDetails({plan,model}:{plan:OutingPlan;model:ReturnType<typeof useOutings>}) {
  const {t}=useTranslation(),accepted=plan.status==='accepted',actor=model.user?.properties.id;
  const share=async()=>{const url=new URL('/outings',location.origin);url.searchParams.set('plan',plan.id);try{if(navigator.share)await navigator.share({title:plan.title,url:url.href});else await navigator.clipboard.writeText(url.href);}catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))toast.error(t('feedback.shareFailed'));}};
  return <section className="space-y-5">
    <h2 className="text-2xl font-bold">{plan.title}</h2><p className="text-sm text-muted-foreground">{t('outings.private')} · {t('outings.expires',{date:formatEventDate(plan.expiresAt)})}</p>
    {!accepted&&<div className="flex flex-wrap gap-3"><ActionButton busy={model.working} onClick={()=>void model.store.respondPlan(plan.id,'accepted')}>{t('outings.accept')}</ActionButton><ActionButton tone="secondary" disabled={model.working} onClick={()=>void model.store.respondPlan(plan.id,'declined')}>{t('outings.decline')}</ActionButton></div>}
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">{plan.members.map(m=><li key={m.userId}>{m.username} · {t('outings.'+m.status)}</li>)}</ul>
    {plan.options.map(e=><article key={e.eventId} className={'space-y-3 rounded-3xl border p-5 '+(plan.chosenEventId===e.eventId?'border-primary':'border-white/10')}>
      {plan.chosenEventId===e.eventId&&<p className="font-semibold text-primary">{t('outings.chosen')}</p>}
      <h3 className="text-xl font-semibold">{e.title}</h3><p className="text-sm text-muted-foreground">{formatEventDate(e.startTime)} · {formatEventTime(e.startTime)} · {e.location}</p>
      {accepted&&<p>{t('outings.votes',{count:planVoteCount(plan,e.eventId)})}</p>}{!e.available&&<p>{t('outings.unavailable')}</p>}
      <div className="flex flex-wrap gap-3">{accepted&&!plan.chosenEventId&&e.available&&<><ActionButton data-testid={'outing-vote-'+e.eventId} tone={plan.members.find(m=>m.userId===actor)?.voteEventId===e.eventId?'primary':'secondary'} disabled={model.working} onClick={()=>void model.store.vote(plan.id,e.eventId)}>{t('outings.vote')}</ActionButton>{plan.ownerId===actor&&<ActionButton tone="ghost" disabled={model.working} onClick={()=>void model.store.choose(plan.id,e.eventId)}>{t('outings.choose')}</ActionButton>}</>}
      <Link className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" href={routeForPlatform('/events/'+e.eventId)}>{t('outings.viewEvent')}</Link></div>
    </article>)}
    {plan.chosenEventId&&<p className="text-sm text-muted-foreground">{t('outings.chosenHint')}</p>}
    <ActionButton tone="secondary" onClick={()=>void share()}>{t('outings.share')}</ActionButton><p className="text-sm text-muted-foreground">{t('outings.shareHint')}</p>
  </section>;
}
