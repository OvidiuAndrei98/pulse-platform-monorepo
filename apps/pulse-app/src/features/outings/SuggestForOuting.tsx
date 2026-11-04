"use client";
import { useTranslation } from 'react-i18next';
import { matchingOutingPlans, type PlanEvent } from '@packages/app-core/outings/model';
import { ActionButton } from '@/components/ui/ActionButton';
import type { useOutings } from './useOutings';
import s from './outings.module.css';

export function SuggestForOuting({event,model,onProposed}:{event:PlanEvent;model:ReturnType<typeof useOutings>;onProposed:(id:string)=>void}) {
  const {t}=useTranslation(),plans=matchingOutingPlans(model.plans,event);
  return <section className={s.section} aria-labelledby="outing-existing-title">
    <div className={s.sectionHeader}><h2 id="outing-existing-title">{t('outings.selectPlan')}</h2></div>
    {!plans.length&&<p className={s.muted}>{t('outings.noMatchingPlans')}</p>}
    <div className={s.stack}>{plans.map(plan=>{
      const added=plan.options.some(option=>option.eventId===event.id);
      return <ActionButton key={plan.id} data-testid={'outing-suggest-'+plan.id} tone="secondary" disabled={model.working}
        onClick={()=>added?onProposed(plan.id):void model.store.propose(plan.id,event.id).then(result=>{if(result)onProposed(plan.id);})}>
        {plan.title}{added?' · '+t('outings.eventStart.alreadyAdded'):''}
      </ActionButton>;
    })}</div>
  </section>;
}
