"use client";
import type {ReactNode} from 'react';
import type {OutingPlan} from '@packages/app-core/outings/model';
import type {FriendGroup} from '@packages/app-core/social/groups';
import {formatRon} from '@packages/app-core/events/serviceFee';
import {EventPreview} from './EventPreview';
import {EventPreference} from './DecisionPoll';
import s from './groups.module.css';

export function EventProposal({plan,group,actor,eventId,onChange,disabled,embedded=false,actions}:{plan:OutingPlan;group:FriendGroup;actor?:string;eventId:string;onChange:(supported:boolean)=>Promise<unknown>|void;disabled?:boolean;embedded?:boolean;actions?:ReactNode}){
 const event=plan.options.find(option=>option.eventId===eventId);
 if(!event)return null;
 return <article className={s.proposal} data-embedded={embedded} data-comparison data-testid={'group-proposal-'+eventId}>
  <EventPreview variant="compact" title={event.title} imageUrl={event.imageUrl} startTime={event.startTime} location={event.location} href={'/events/'+eventId} action={actions}>
   {event.totalPriceRon!==undefined&&<span className={s.previewPrice}>{formatRon(event.totalPriceRon)}</span>}
  </EventPreview>
  <EventPreference plan={plan} group={group} actor={actor} eventId={eventId} testId={'group-preference-'+eventId} disabled={disabled||!event.available} onChange={onChange}/>
 </article>;
}
