import { resources } from '../i18n/resources';
import { fitsZone,totalItems,type Deposit,type Items,type WardrobeEvent,type Zone } from './model';
export type WardrobeTask = 'receive' | 'pickup' | 'setup' | 'history' | 'unclaimed';
export const operatorAccount = (role: unknown) => role === 'organizer' || role === 'admin';
export const wardrobeTasks = (manage: boolean): WardrobeTask[] => ['receive','pickup','unclaimed','history',...(manage ? ['setup' as const]:[])];
export function wardrobeTabLabel(task:WardrobeTask,ro:boolean):string {
  return resources[ro ? 'ro' : 'en'].translation.wardrobe.tabs[task];
}
export function wardrobeEventPhase(event:WardrobeEvent,now=Date.now()):'live'|'upcoming'|'active'|'other' {
  const start=Date.parse(event.startTime??''),end=Date.parse(event.endTime??'');
  if(event.status&&!['published','scheduled','live'].includes(event.status)||Number.isFinite(end)&&end<=now)return 'other';
  if(Number.isFinite(start)&&start>now)return 'upcoming';
  return Number.isFinite(start)&&Number.isFinite(end)?'live':'active';
}
export function wardrobeEventPhaseLabel(event:WardrobeEvent,ro:boolean):string {
  return resources[ro ? 'ro' : 'en'].translation.wardrobe.phases[wardrobeEventPhase(event)];
}
export const taskDeposits = (task:WardrobeTask|null,rows:Deposit[]):Deposit[] => task==='receive'?[]:task==='pickup'?rows.filter(row=>row.status==='stored'):rows;
export function changeItemCount(current:Items,key:keyof Items,delta:1|-1,max?:Items):Items {
  if(delta===1&&(totalItems(current)>=20||current[key]>=(max?.[key]??20)))return current;
  return {...current,[key]:Math.max(0,current[key]+delta)};
}
export function wardrobeFlow(ro: boolean) {
  return resources[ro ? 'ro' : 'en'].translation.wardrobe.flow;
}
export function availableZones(items: Items,zones:Zone[]) { return zones.filter(zone=>fitsZone(items,zone)&&zone.capacity>zone.occupied); }
export function canReserveBelongings(items: Items,zoneId:string,zones:Zone[],accepting:boolean) {return accepting&&totalItems(items)>0&&availableZones(items,zones).some(zone=>zone.id===zoneId);}
export function wardrobeEventDescription(event:WardrobeEvent,ro:boolean) {const at=event.startTime ? Date.parse(event.startTime):NaN;return [Number.isFinite(at)?new Intl.DateTimeFormat(ro?'ro-RO':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(at)):'',event.location].filter(Boolean).join(' · ');}
