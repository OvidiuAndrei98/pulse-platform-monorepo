export const DISCOVERY_TIME_ZONE = 'Europe/Bucharest';
export function activeDiscoveryStart(start:string|undefined,now=new Date().toISOString()) {return start&&start>now?start:now;}
export function normalizeDiscoverySearch(value: string) { return Array.from(value.replace(/\s+/g,' ').trim()).slice(0,120).join(''); }
export function validCalendarDay(value: unknown): value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value&&value>='1970-01-01'&&value<='2100-12-31';
}
export function shiftCalendarDay(value: string, days: number) {
  const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
}
export function productToday(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:DISCOVERY_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=(key:string)=>parts.find(part=>part.type===key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function productMidnight(day:string) {
  const [year,month,date]=day.split('-').map(Number) as [number,number,number];
  const utc=Date.UTC(year,month-1,date);
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:DISCOVERY_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(utc));
  const get=(key:string)=>Number(parts.find(part=>part.type===key)!.value);
  const wall=Date.UTC(get('year'),get('month')-1,get('day'),get('hour'),get('minute'),get('second'));
  return new Date(utc-(wall-utc)).toISOString();
}
export function calendarCells(month:string) {
  const first=month.slice(0,7)+'-01',weekday=new Date(first+'T12:00:00Z').getUTCDay();
  return Array.from({length:42},(_,index)=>shiftCalendarDay(first,index-(weekday+6)%7));
}
export function selectCalendarDay(from:string,to:string,day:string,range:boolean) {
  if(!range)return {dateFrom:day,dateTo:day};
  if(!from||to)return {dateFrom:day,dateTo:''};
  return {dateFrom:day<from?day:from,dateTo:day<from?from:day};
}
export function eventMatchesSearch(event:{id:string;title:string;locationName?:string;city?:string;category?:string},query:string) {
  return !query||[event.title,event.locationName,event.city,event.category,event.id].join(' ').toLowerCase().includes(query.toLowerCase());
}
export function eventWithinDistance(event:{latitude?:number|null;longitude?:number|null},center:readonly[number,number]|null,km:number) {
  if(!center)return true;
  const lat=event.latitude,lon=event.longitude;
  if(typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return false;
  const rad=(value:number)=>value*Math.PI/180;
  const a=Math.sin(rad(lat-center[0])/2)**2+Math.cos(rad(center[0]))*Math.cos(rad(lat))*Math.sin(rad(lon-center[1])/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(Math.min(1,a)),Math.sqrt(Math.max(0,1-a)))<=km;
}
