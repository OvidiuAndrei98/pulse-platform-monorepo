import React from 'react';
import { View } from 'react-native';
import { matchingOutingPlans, type PlanEvent } from '@packages/app-core/outings/model';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { usePreferences } from '../usePreferences';
import type { useOutings } from './useOutings';
import { o } from './outingsStyles';

export function SuggestForOuting({event,model,onProposed}:{event:PlanEvent;model:ReturnType<typeof useOutings>;onProposed:(id:string)=>void}) {
  const {copy}=usePreferences(),plans=matchingOutingPlans(model.plans,event);
  return <View style={o.section}>
    <Text accessibilityRole="header" style={o.heading}>{copy('outings.selectPlan')}</Text>
    {!plans.length&&<Text style={o.muted}>{copy('outings.noMatchingPlans')}</Text>}
    {plans.map(plan=>{
      const added=plan.options.some(option=>option.eventId===event.id);
      return <ActionButton key={plan.id} testID={'outing-suggest-'+plan.id} title={plan.title+(added?' · '+copy('outings.eventStart.alreadyAdded'):'')} tone="secondary" disabled={model.working}
        onPress={()=>added?onProposed(plan.id):void model.store.propose(plan.id,event.id).then(result=>{if(result)onProposed(plan.id);})}/>;
    })}
  </View>;
}
