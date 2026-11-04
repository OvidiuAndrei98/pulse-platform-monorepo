"use client";
import { useEffect, useRef, useState } from 'react';
import { List, Map as MapIcon, MapPin, Search, X } from 'lucide-react';
import { ThemedSelect } from '../form/ThemedSelect';
import { useTranslation } from 'react-i18next';
import { EventViewToggle } from '../components/EventViewToggle';
import { FiltersSheet } from '@/components/FiltersSheet';
import { eventCities } from '@packages/app-core/events/constants';
import type { EventFilters } from '@packages/app-core/events/types';
import { DiscoveryDateRibbon } from './DiscoveryDateRibbon';
import s from './discoveryToolbar.module.css';
import {Input as UIInput} from '@/components/ui/Field';
import { motion, useMotionValue, useTransform } from 'framer-motion';

export function DiscoveryToolbar({filters,onChange,view,onViewChange,distanceReady}:{filters:EventFilters;onChange:(value:EventFilters)=>void;view:'list'|'map';onViewChange:(view:'list'|'map')=>void;distanceReady:boolean}) {
  const {t}=useTranslation(),[searchOpen,setSearchOpen]=useState(!!filters.q),[wide,setWide]=useState(false);
  const [dateExpanded,setDateExpanded]=useState(false), dateProgress=useMotionValue(0), toolbarOpacity=useTransform(dateProgress,[0,0.2],[1,0]);
  const dateAnchor=useRef<HTMLSpanElement>(null);
  useEffect(()=>{const media=matchMedia('(min-width:1024px)');const update=()=>setWide(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  const input=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null),toolbar=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(searchOpen){const frame=requestAnimationFrame(()=>input.current?.focus());return()=>cancelAnimationFrame(frame);}},[searchOpen]);
  useEffect(()=>{if(filters.q)setSearchOpen(true);},[filters.q]);
  const closeSearch=()=>{onChange({...filters,q:''});setSearchOpen(false);requestAnimationFrame(()=>wide?input.current?.focus():trigger.current?.focus());};
  return <div ref={toolbar} className={s.stage}><motion.div className={s.toolbar} data-testid="discovery-toolbar" data-search-open={searchOpen} style={{opacity:toolbarOpacity,pointerEvents:dateExpanded?'none':'auto'}} inert={dateExpanded?true:undefined}>
    <div className={s.fullModes} inert={!wide&&searchOpen?true:undefined}><EventViewToggle view={view} onChange={onViewChange}/></div>
    <button type="button" className={`${s.pill} ${s.round} ${s.compactModes}`} data-testid={'events-'+(view==='map'?'list':'map')+'-compact-toggle'} aria-label={t(view==='map'?'eventMap.list':'eventMap.map')} onClick={()=>onViewChange(view==='map'?'list':'map')}>{view==='map'?<List size={16}/>:<MapIcon size={16}/>}</button>
    <button ref={trigger} type="button" data-testid="discovery-search-toggle" className={`${s.pill} ${s.round} ${s.searchToggle}`} aria-label={t('filters.searchEvents')} aria-expanded={searchOpen} onClick={()=>setSearchOpen(true)}><Search size={16}/></button>
    <div className={`ui-input-shell ${s.pill} ${s.search}`} role="search" inert={!wide&&!searchOpen?true:undefined}>
      <Search size={16} aria-hidden className="shrink-0 text-white/70"/>
      <UIInput bare ref={input} data-testid="discovery-search" type="search" name="event-search" autoComplete="off" aria-label={t('filters.searchEvents')} placeholder={t('filters.searchEvents')} value={filters.q??''} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closeSearch();}}} onChange={event=>onChange({...filters,q:Array.from(event.target.value).slice(0,120).join('')})}/>
      <button type="button" aria-label={t('filters.closeSearch')} onClick={closeSearch}><X size={16}/></button>
    </div>
    <div className={s.city}><ThemedSelect label={t('filters.city')} testId="discovery-city" variant="toolbar" icon={MapPin} placeholder={t('filters.allCities')} value={filters.city} onChange={city=>onChange({...filters,city})} options={[{value:'',label:t('filters.allCities')},...eventCities.map(city=>({value:city,label:city}))]}/></div>
    <FiltersSheet value={filters} onChange={onChange} desktopCompact distanceReady={distanceReady}/>
    <span ref={dateAnchor} data-testid="discovery-calendar-anchor" className={`${s.pill} ${s.round}`} style={{visibility:'hidden'}} aria-hidden/>
  </motion.div><DiscoveryDateRibbon filters={filters} onChange={onChange} hidden={!wide&&searchOpen} expanded={dateExpanded} sourceRef={dateAnchor} progress={dateProgress} onOpenChange={setDateExpanded}/></div>;
}
