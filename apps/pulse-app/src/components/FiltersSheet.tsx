"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDrawerViewport } from '@/components/ui/useDrawerViewport';
import { useBackLayer } from '@/lib/navigation/useBackLayer';
import { defaultEventFilters } from '@/features/events/constants';
import type { EventFilters } from '@/features/events/types';
import { EventFiltersPanel } from '@/features/events/filters/EventFiltersPanel';

export function FiltersSheet({value,onChange,desktopCompact=false,distanceReady=true}:{value?:EventFilters;onChange?:(value:EventFilters)=>void;desktopCompact?:boolean;distanceReady?:boolean}={}) {
  const {t}=useTranslation(),[open,setOpen]=useState(false),[mounted,setMounted]=useState(false),[wide,setWide]=useState(false);
  const [filters,setFilters]=useState(value??defaultEventFilters),[error,setError]=useState('');
  const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null),viewport=useDrawerViewport(open&&mounted);
  const bindDialog=useCallback((node:HTMLDialogElement|null)=>{dialog.current=node;viewport(node);},[viewport]);
  useBackLayer(open,()=>setOpen(false));
  useEffect(()=>{setMounted(true);const media=matchMedia('(min-width:1024px)');const update=()=>setWide(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{if(open&&value)setFilters(value);},[value,open]);
  useEffect(()=>{
    const node=dialog.current;if(open&&mounted&&!node?.open)node?.showModal();
    else if(!open&&node?.open){node.close();trigger.current?.focus();}
  },[open,mounted]);
  const compact=desktopCompact&&wide;
  const reset=()=>{setError('');setFilters(compact?{...filters,categories:[],vibes:[],distance:defaultEventFilters.distance}:defaultEventFilters);};
  const apply=()=>{
    if(!compact&&filters.date==='Custom'&&filters.dateFrom&&!filters.dateTo){setError(t('filters.chooseRangeEnd'));return;}
    onChange?.(filters);setOpen(false);
  };
  return <>
    <button ref={trigger} type="button" data-testid="event-filters" aria-haspopup="dialog" aria-expanded={open} aria-label={t('common.filters')} onClick={()=>{setError('');setOpen(true);}}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-[#121418]/85 text-white/70 shadow-lg hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2">
      <SlidersHorizontal aria-hidden className="h-4 w-4" strokeWidth={2.2}/>
    </button>
    {mounted&&createPortal(<dialog ref={bindDialog} onCancel={event=>{event.preventDefault();setOpen(false);}} aria-label={t('common.filters')}
      onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();if(event.target===event.currentTarget&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))setOpen(false);}}
      className="fixed inset-x-3 bottom-3 top-16 m-0 h-[calc(100dvh-5rem)] max-h-[calc(100dvh-5rem)] w-auto overflow-hidden rounded-lg border border-white/15 bg-[#141414] p-0 text-foreground shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:h-auto lg:max-h-[85dvh] lg:w-[min(32rem,calc(100vw-2rem))] lg:-translate-x-1/2 lg:-translate-y-1/2">
      <div className="flex h-full max-h-[inherit] min-h-0 flex-col lg:h-auto">
        {open&&<EventFiltersPanel filters={filters} onChange={value=>{setFilters(value);setError('');}} onClose={()=>setOpen(false)} onReset={reset} onApply={apply} compact={compact} distanceReady={!!filters.city||distanceReady} error={error}/>}
      </div>
    </dialog>,document.body)}
  </>;
}
