import { planningBoundary } from './model';
import { shiftCalendarDay,validCalendarDay } from '../events/discoveryFilters';
import type { OutingPlan } from './model';

export function outingStage(plan:OutingPlan):'invited'|'ideas'|'voting'|'ready' {
  if(plan.status==='pending')return 'invited';
  if(plan.chosenEventId)return 'ready';
  return plan.outingDate?'voting':'ideas';
}
export function outingInitials(name:string):string {
  const words=name.trim().split(/[\s._-]+/u).filter(Boolean);
  return [words[0],words.length>1?words.at(-1):undefined].filter(Boolean)
    .map(word=>Array.from(word!)[0]).join('').toLocaleUpperCase().slice(0,2)||'?';
}
export function outingDate(day:string|undefined,language:string,part:'full'|'day'|'month'='full'):string {
  if(!validCalendarDay(day))return '';
  const date=new Date(day+'T12:00:00Z'),locale=language.startsWith('ro')?'ro-RO':'en-GB';
  const options:Intl.DateTimeFormatOptions=part==='day'?{day:'numeric'}:part==='month'?{month:'short'}:{weekday:'short',day:'numeric',month:'long'};
  return new Intl.DateTimeFormat(locale,{...options,timeZone:'UTC'}).format(date);
}
export function optionVoters(plan:OutingPlan,eventId:string) {
  const reactions=plan.options.find(option=>option.eventId===eventId)?.reactions;
  return plan.members.filter(member=>member.status==='accepted'&&(reactions?reactions.some(r=>r.userId===member.userId&&r.answer==='yes'):member.voteEventId===eventId));
}

export const outingAnswers=['yes','maybe','no'] as const;
export const arrivalStates=['not_set','leaving_soon','on_way','arrived','not_coming'] as const;
export function responseCount(plan:OutingPlan) {
  const ids=plan.outingDate?plan.options.flatMap(option=>option.reactions?.map(r=>r.userId)??plan.members.filter(m=>m.voteEventId===option.eventId).map(m=>m.userId)):plan.candidateDates?.flatMap(day=>day.responses.map(r=>r.userId))??[];
  return new Set(ids.filter(id=>plan.members.some(m=>m.userId===id&&m.status==='accepted'))).size;
}
export function defaultDecisionAt(days:readonly string[],now=Date.now(),hours=2) {
  const last=[...days].sort().at(-1);
  if(!last)return new Date(now+hours*3600000).toISOString();
  // Leave one minute before the following night's 06:00 Romania boundary.
  const end=Date.parse(planningBoundary(shiftCalendarDay(last,1)))-60000;
  return new Date(Math.min(now+hours*3600000,end)).toISOString();
}
export function planNightEnded(plan:Pick<OutingPlan,'outingDate'|'expiresAt'>,now=Date.now()) {
  return Date.parse(plan.expiresAt)<=now||!!plan.outingDate&&Date.parse(planningBoundary(shiftCalendarDay(plan.outingDate,1)))<=now;
}
export function validBudget(value:string) {return value.trim()===''||/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())&&Number(value.replace(',','.'))<=1_000_000;}
