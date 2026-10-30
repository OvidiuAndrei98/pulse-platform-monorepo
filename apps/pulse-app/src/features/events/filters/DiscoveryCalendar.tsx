"use client";
import { useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { calendarCells, productToday, selectCalendarDay, shiftCalendarDay } from '../discoveryFilters';
import s from './discoveryToolbar.module.css';

export function DiscoveryCalendar({from='',to='',onChange}:{from?:string;to?:string;onChange:(from:string,to:string)=>void}) {
  const {t,i18n}=useTranslation(),id=useId(),locale=i18n.language.startsWith('ro')?'ro-RO':'en-GB';
  const [range,setRange]=useState(!!from&&from!==to),[month,setMonth]=useState((from||productToday()).slice(0,7)+'-01');
  const [focused,setFocused]=useState(from||productToday()),buttons=useRef(new Map<string,HTMLButtonElement>());
  const today=productToday(),cells=calendarCells(month),date=(day:string)=>new Date(day+'T12:00:00Z');
  const moveMonth=(by:number)=>{const value=date(month);value.setUTCMonth(value.getUTCMonth()+by);setMonth(value.toISOString().slice(0,10));};
  const keyboard=(event:React.KeyboardEvent,day:string)=>{
    const week=(date(day).getUTCDay()+6)%7;
    const delta:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-week,End:6-week};
    if(!(event.key in delta))return;
    event.preventDefault();const target=shiftCalendarDay(day,delta[event.key]!);if(target<today)return;
    setFocused(target);if(target.slice(0,7)!==month.slice(0,7))setMonth(target.slice(0,7)+'-01');
    requestAnimationFrame(()=>buttons.current.get(target)?.focus());
  };
  return <div className={s.calendar} data-testid="discovery-calendar">
    <fieldset className={s.modes}><legend className="sr-only">{t('filters.when')}</legend>
      {[false,true].map(mode=><label key={String(mode)}><input type="radio" name={id} checked={range===mode} onChange={()=>{setRange(mode);onChange(from,mode?'':from);}}/>{t(mode?'filters.dateRange':'filters.singleDay')}</label>)}
    </fieldset>
    <div className={s.month}>
      <button type="button" aria-label={t('filters.previousMonth')} onClick={()=>moveMonth(-1)}><ChevronLeft aria-hidden size={16}/></button>
      <span aria-live="polite">{new Intl.DateTimeFormat(locale,{month:'long',year:'numeric',timeZone:'UTC'}).format(date(month))}</span>
      <button type="button" aria-label={t('filters.nextMonth')} onClick={()=>moveMonth(1)}><ChevronRight aria-hidden size={16}/></button>
    </div>
    <div className={s.days} role="group" aria-label={t('filters.calendar')}>
      {Array.from({length:7},(_,index)=>shiftCalendarDay('2026-10-26',index)).map(day=><span key={day} className={s.weekday} aria-label={new Intl.DateTimeFormat(locale,{weekday:'long',timeZone:'UTC'}).format(date(day))}>{new Intl.DateTimeFormat(locale,{weekday:'narrow',timeZone:'UTC'}).format(date(day))}</span>)}
      {cells.map(day=><button key={day} ref={node=>{if(node)buttons.current.set(day,node);else buttons.current.delete(day);}}
        type="button" data-testid={'discovery-day-'+day} disabled={day<today} tabIndex={day===focused||(!cells.includes(focused)&&day===cells.find(value=>value>=today))?0:-1}
        aria-label={new Intl.DateTimeFormat(locale,{dateStyle:'full',timeZone:'UTC'}).format(date(day))}
        aria-pressed={!!from&&day>=from&&day<=(to||from)} data-selected={day===from||day===to} data-range={!!from&&!!to&&day>from&&day<to}
        data-muted={day.slice(0,7)!==month.slice(0,7)} aria-current={day===today?'date':undefined}
        onFocus={()=>setFocused(day)} onKeyDown={event=>keyboard(event,day)} onClick={()=>{const value=selectCalendarDay(from,to,day,range);onChange(value.dateFrom,value.dateTo);}}>{Number(day.slice(-2))}</button>)}
    </div>
    <p className={s.hint}>{range&&from&&!to?t('filters.chooseRangeEnd'):t('filters.calendarHint')}</p>
    <button type="button" className={s.clearDate} onClick={()=>onChange('','')}>{t('filters.clearDates')}</button>
  </div>;
}
