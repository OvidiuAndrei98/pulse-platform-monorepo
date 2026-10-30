"use client";
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, List, Map as MapIcon, MapPin, Search, X } from 'lucide-react';
import { ThemedSelect } from '../form/ThemedSelect';
import { useTranslation } from 'react-i18next';
import { EventViewToggle } from '../components/EventViewToggle';
import { FiltersSheet } from '@/components/FiltersSheet';
import { eventCities } from '../constants';
import type { EventFilters } from '../types';
import { DiscoveryCalendar } from './DiscoveryCalendar';
import { useBackLayer } from '@/lib/navigation/useBackLayer';
import s from './discoveryToolbar.module.css';

export function DiscoveryToolbar({filters,onChange,view,onViewChange,distanceReady}:{filters:EventFilters;onChange:(value:EventFilters)=>void;view:'list'|'map';onViewChange:(view:'list'|'map')=>void;distanceReady:boolean}) {
  const {t}=useTranslation(),[searchOpen,setSearchOpen]=useState(!!filters.q),[calendarOpen,setCalendarOpen]=useState(false),[draft,setDraft]=useState(filters),[error,setError]=useState(''),[wide,setWide]=useState(false);
  useBackLayer(calendarOpen,()=>setCalendarOpen(false));
  useEffect(()=>{const media=matchMedia('(min-width:1024px)');const update=()=>setWide(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const input=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null),dateTrigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null),toolbar=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(searchOpen){const frame=requestAnimationFrame(()=>input.current?.focus());return()=>cancelAnimationFrame(frame);}},[searchOpen]);
  useEffect(()=>{if(filters.q)setSearchOpen(true);},[filters.q]);
  useEffect(()=>{const node=dialog.current;if(calendarOpen&&!node?.open)node?.showModal();else if(!calendarOpen&&node?.open){node.close();if(wide)dateTrigger.current?.focus();else toolbar.current?.querySelector<HTMLButtonElement>('[data-testid="event-filters"]')?.focus();}},[calendarOpen,wide]);
  const closeSearch=()=>{onChange({...filters,q:''});setSearchOpen(false);requestAnimationFrame(()=>wide?input.current?.focus():trigger.current?.focus());};
  const label=filters.date==='Custom'&&filters.dateFrom?`${filters.dateFrom}${filters.dateTo!==filters.dateFrom?' – '+filters.dateTo:''}`:t('filters.calendar');
  return <div ref={toolbar} className={s.toolbar} data-testid="discovery-toolbar" data-search-open={searchOpen}>
    <div className={s.fullModes} inert={!wide&&searchOpen?true:undefined}><EventViewToggle view={view} onChange={onViewChange}/></div>
    <button type="button" className={`${s.pill} ${s.round} ${s.compactModes}`} data-testid={'events-'+(view==='map'?'list':'map')+'-compact-toggle'} aria-label={t(view==='map'?'eventMap.list':'eventMap.map')} onClick={()=>onViewChange(view==='map'?'list':'map')}>{view==='map'?<List size={16}/>:<MapIcon size={16}/>}</button>
    <button ref={trigger} type="button" data-testid="discovery-search-toggle" className={`${s.pill} ${s.round} ${s.searchToggle}`} aria-label={t('filters.searchEvents')} aria-expanded={searchOpen} onClick={()=>setSearchOpen(true)}><Search size={16}/></button>
    <div className={`${s.pill} ${s.search}`} role="search" inert={!wide&&!searchOpen?true:undefined}>
      <Search size={16} aria-hidden className="shrink-0 text-white/70"/>
      <input ref={input} data-testid="discovery-search" type="search" name="event-search" autoComplete="off" aria-label={t('filters.searchEvents')} placeholder={t('filters.searchEvents')} value={filters.q??''} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closeSearch();}}} onChange={event=>onChange({...filters,q:Array.from(event.target.value).slice(0,120).join('')})}/>
      <button type="button" aria-label={t('filters.closeSearch')} onClick={closeSearch}><X size={16}/></button>
    </div>
    <button ref={dateTrigger} type="button" data-testid="discovery-calendar-toggle" className={`${s.pill} ${s.dateButton}`} aria-haspopup="dialog" onClick={()=>{setDraft(filters);setError('');setCalendarOpen(true);}}><CalendarDays size={16} className="shrink-0 text-primary"/><span>{label}</span></button>
    <div className={s.city}><ThemedSelect label={t('filters.city')} testId="discovery-city" variant="toolbar" icon={MapPin} placeholder={t('filters.allCities')} value={filters.city} onChange={city=>onChange({...filters,city})} options={[{value:'',label:t('filters.allCities')},...eventCities.map(city=>({value:city,label:city}))]}/></div>
    <FiltersSheet value={filters} onChange={onChange} desktopCompact distanceReady={distanceReady}/>
    <dialog ref={dialog} className={s.dialog} onCancel={event=>{event.preventDefault();setCalendarOpen(false);}} onClick={event=>{const r=event.currentTarget.getBoundingClientRect();if(event.target===event.currentTarget&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))setCalendarOpen(false);}} aria-label={t('filters.calendar')}>
      {calendarOpen&&<><div className={s.dialogHeader}><h2>{t('filters.calendar')}</h2><button type="button" aria-label={t('common.close')} onClick={()=>setCalendarOpen(false)}><X size={18}/></button></div>
      <DiscoveryCalendar from={draft.dateFrom} to={draft.dateTo} onChange={(dateFrom,dateTo)=>{setDraft({...draft,date:dateFrom?'Custom':'See all',dateFrom,dateTo});setError('');}}/>
      {error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="button" className={s.apply} onClick={()=>{if(draft.dateFrom&&!draft.dateTo){setError(t('filters.chooseRangeEnd'));return;}onChange({...filters,date:draft.date,dateFrom:draft.dateFrom,dateTo:draft.dateTo});setCalendarOpen(false);}}>{t('common.applyFilters')}</button></>}
    </dialog>
  </div>;
}
