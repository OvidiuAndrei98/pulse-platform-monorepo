import { validCalendarDay } from '../events/discoveryFilters';
import type { OutingPlan } from './model';

export function outingStage(plan:OutingPlan):'invited'|'ideas'|'voting'|'ready' {
  if(plan.status==='pending')return 'invited';
  if(plan.chosenEventId)return 'ready';
  return plan.options.length?'voting':'ideas';
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
  return plan.members.filter(member=>member.status==='accepted'&&member.voteEventId===eventId);
}
