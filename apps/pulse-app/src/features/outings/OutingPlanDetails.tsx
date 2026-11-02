"use client";
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { planVoteCount, type OutingPlan } from '@packages/app-core/outings/model';
import { ActionButton } from '@/components/ui/ActionButton';
import { routeForPlatform } from '@/lib/native/navigation';
import { formatEventDate, formatEventTime } from '@/features/events/dateFormat';
import { PlanProposals } from './PlanProposals';
import type { useOutings } from './useOutings';

export function OutingPlanDetails({plan,model}:{plan:OutingPlan;model:ReturnType<typeof useOutings>}) {
  const {t,i18n}=useTranslation(),accepted=plan.status==='accepted',actor=model.user?.properties.id;
  const mine=plan.members.find(member=>member.userId===actor);
  const amount=(value:number)=>new Intl.NumberFormat(i18n.language,{maximumFractionDigits:2}).format(value);
  const share=async()=>{
    const url=new URL('/outings',location.origin);url.searchParams.set('plan',plan.id);
    try{if(navigator.share)await navigator.share({title:plan.title,url:url.href});else await navigator.clipboard.writeText(url.href);}
    catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))toast.error(t('feedback.shareFailed'));}
  };
  const eventLink=(id:string)=>routeForPlatform('/events/'+id);
  return <section className="space-y-5">
    <h2 className="text-2xl font-bold">{plan.title}</h2>
    <p className="text-muted-foreground">{[plan.outingDate,plan.city].filter(Boolean).join(' · ')}</p>
    <p className="text-sm text-muted-foreground">{t('outings.private')} · {t('outings.expires',{date:formatEventDate(plan.expiresAt)})}</p>
    {!accepted?<div className="flex flex-wrap gap-3">
      <ActionButton busy={model.working} onClick={()=>void model.store.respondPlan(plan.id,'accepted')}>{t('outings.accept')}</ActionButton>
      <ActionButton tone="secondary" disabled={model.working} onClick={()=>void model.store.respondPlan(plan.id,'declined')}>{t('outings.decline')}</ActionButton>
    </div>:<>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">{plan.members.map(member=><li key={member.userId}>{member.username} · {t('outings.'+member.status)}</li>)}</ul>
      <h3 className="text-xl font-semibold">{t('outings.events')}</h3>
      {!plan.options.length&&<p className="text-muted-foreground">{t('outings.noProposals')}</p>}
      {plan.options.map(event=><article key={event.eventId} className={'space-y-3 rounded-3xl border p-5 '+(plan.chosenEventId===event.eventId?'border-primary':'border-white/10')}>
        {plan.chosenEventId===event.eventId&&<p className="font-semibold text-primary">{t('outings.chosen')}</p>}
        <h3 className="text-xl font-semibold">{event.title}</h3>
        <p className="text-sm text-muted-foreground">{formatEventDate(event.startTime)} · {formatEventTime(event.startTime)} · {event.location}</p>
        {event.priceRon!==undefined&&event.ticketAvailability!=='external'&&<p>{event.priceRon===0?t('outings.free'):t('outings.priceFrom',{amount:amount(event.priceRon)})}</p>}
        {event.ticketAvailability&&<p className="text-sm text-muted-foreground">{t('outings.availability.'+event.ticketAvailability)}</p>}
        <p>{t('outings.votes',{count:planVoteCount(plan,event.eventId)})}</p>
        {!event.available&&<p>{t('outings.unavailable')}</p>}
        <div className="flex flex-wrap gap-3">
          {!plan.chosenEventId&&event.available&&<>
            <ActionButton data-testid={'outing-vote-'+event.eventId} tone={mine?.voteEventId===event.eventId?'primary':'secondary'} disabled={model.working} onClick={()=>void model.store.vote(plan.id,event.eventId)}>{t('outings.vote')}</ActionButton>
            {plan.ownerId===actor&&<ActionButton tone="ghost" disabled={model.working} onClick={()=>void model.store.choose(plan.id,event.eventId)}>{t('outings.choose')}</ActionButton>}
          </>}
          <Link className="inline-flex min-h-11 items-center text-primary underline" href={eventLink(event.eventId)}>{t('outings.viewEvent')}</Link>
        </div>
      </article>)}
      {!plan.chosenEventId&&(plan.outingDate&&plan.city?<PlanProposals plan={plan} model={model}/>:<p>{t('outings.legacyContext')}</p>)}
      {plan.chosenEventId&&<section className="space-y-3 rounded-3xl border border-white/10 p-5">
        <h3 className="text-xl font-semibold">{t('outings.ticketsReady')}</h3>
        {plan.members.filter(member=>member.status==='accepted').map(member=><p key={member.userId}>{member.username} · {t(member.hasTicket?'outings.hasTicket':'outings.needsTicket')}</p>)}
        <p className="text-sm text-muted-foreground">{t('outings.ticketPrivacy')}</p><p>{t('outings.chosenHint')}</p>
        <div className="flex flex-wrap gap-4">
          {mine?.hasTicket?<>
            <Link className="inline-flex min-h-11 items-center text-primary underline" href={routeForPlatform('/events/'+plan.chosenEventId+'/night')}>{t('outings.night')}</Link>
            <Link className="inline-flex min-h-11 items-center text-primary underline" href={routeForPlatform('/events/'+plan.chosenEventId+'/group')}>{t('outings.openGroup')}</Link>
          </>:<Link className="inline-flex min-h-11 items-center text-primary underline" href={eventLink(plan.chosenEventId)}>{t('outings.buyTicket')}</Link>}
        </div>
      </section>}
    </>}
    <ActionButton tone="secondary" onClick={()=>void share()}>{t('outings.share')}</ActionButton>
    <p className="text-sm text-muted-foreground">{t('outings.shareHint')}</p>
  </section>;
}
