"use client";
import { useTranslation } from 'react-i18next';
import { ApiClient, type ReadableSchema } from '@packages/api-client/client';
import { matchesPlanningContext } from '@packages/app-core/outings/model';
import { useCachedClientQuery } from '@/lib/useCachedClientQuery';
import { ActionButton } from '@/components/ui/ActionButton';
import type { useOutings } from './useOutings';

export function SuggestForOuting({eventId,model,onProposed}:{
  eventId:string;model:ReturnType<typeof useOutings>;onProposed:(id:string)=>void;
}) {
  const {t}=useTranslation();
  const event=useCachedClientQuery<ReadableSchema<'EventResponse'>|null>(model.user?'outing-suggestion:'+model.user.properties.id+':'+eventId:null,
    ()=>ApiClient.instance.get('/events/{id}',{params:{path:{id:eventId}}}),null);
  const plans=model.plans.filter(plan=>plan.status==='accepted'&&!plan.chosenEventId&&plan.options.length<8&&event.data&&matchesPlanningContext(event.data,plan));
  return <section className="space-y-3">
    <h2 className="text-xl font-semibold">{t('outings.selectPlan')}</h2>
    {event.error?<ActionButton onClick={event.retry}>{t('common.retry')}</ActionButton>:!event.pending&&!plans.length&&<p className="text-muted-foreground">{t('outings.noMatchingPlans')}</p>}
    {plans.map(plan=><ActionButton key={plan.id} data-testid={'outing-suggest-'+plan.id} className="w-full" tone="secondary" disabled={model.working}
      onClick={()=>void model.store.propose(plan.id,eventId).then(result=>{if(result)onProposed(plan.id);})}>{plan.title}</ActionButton>)}
  </section>;
}
