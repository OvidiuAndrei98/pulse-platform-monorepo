"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { Map as LibreMap } from "maplibre-gl";
import type { Event } from "@/core/DataProvider";
import { MapControls } from "@/features/events/map/MapControls";
import { SelectedEventPopup } from "@/features/events/map/SelectedEventPopup";
import { VectorEventMap, type MapFocus } from "@/features/events/map/VectorEventMap";
import { useEventDetails } from "@/components/EventDetailsSheet";
import type { Coordinates } from "@/features/events/types";
import { useTranslation } from "react-i18next";
import { requestCurrentLocation } from "@/lib/native/location";
import { readNavigationState, writeNavigationState } from "@/lib/navigation/state";
import { formatEventDateShort, formatEventTime } from "@/features/events/dateFormat";
import { zoomForDistance } from "../../../spottr-native/src/map/geometry";
import carouselStyle from "@/features/events/map/eventMapCarousel.module.css";

export function EventsMapView({events,selectedId:selectedIdProp,onSelect,fullScreenOnMobile=false,desktopFillViewport=false,isFullView=false,onToggleFullView,userLocation:userLocationProp,onUserLocationChange,onBoundsEventsChange,focusRequest,distanceKm=15,cityCenter}: {
  events:Event[];selectedId?:string|null;onSelect?:(id:string|null)=>void;fullScreenOnMobile?:boolean;desktopFillViewport?:boolean;
  isFullView?:boolean;onToggleFullView?:()=>void;userLocation?:Coordinates|null;onUserLocationChange?:(location:Coordinates)=>void;
  onBoundsEventsChange?:(ids:string[])=>void;focusRequest?:{eventId:string;requestId:number}|null;distanceKm?:number;cityCenter?:Coordinates|null;
}) {
  const {t}=useTranslation(),{open}=useEventDetails();
  const rail=useRef<HTMLDivElement>(null),cards=useRef(new Map<string,HTMLButtonElement>()),railSelection=useRef<string|null>(null);
  const scrollTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [mobile,setMobile]=useState(false),[carouselHeight,setCarouselHeight]=useState(148),[internalId,setInternalId]=useState<string|null>(null);
  const [location,setLocation]=useState<Coordinates|null>(userLocationProp??null),[map,setMap]=useState<LibreMap|null>(null);
  const [focus,setFocus]=useState<MapFocus|null>(null),[point,setPoint]=useState<{x:number;y:number}|null>(null);
  const vectorLocation=useMemo(()=>location?{latitude:location[0],longitude:location[1]}:null,[location?.[0],location?.[1]]);
  const mapEvents=useMemo(()=>events.filter(event=>Number.isFinite(event.latitude)&&Number.isFinite(event.longitude)&&Math.abs(event.latitude)<=90&&Math.abs(event.longitude)<=180),[events]);
  const selectedId=selectedIdProp!==undefined?selectedIdProp:internalId;
  const setSelectedId=useCallback((id:string|null)=>{if(onSelect)onSelect(id);else setInternalId(id);},[onSelect]);
  const choose=(id:string|null,focusMap=false)=>{setSelectedId(id);if(id&&focusMap)setFocus(current=>({id,revision:(current?.revision??0)+1}));};
  const selectedEvent=mapEvents.find(event=>event.id===selectedId);
  const activeId=selectedEvent?.id??mapEvents[0]?.id;
  const navKey=`map:${cityCenter?.join(",")??"nearby"}:${distanceKm}`;
  const initial=useMemo(()=>{
    const saved=readNavigationState<{center:Coordinates;zoom:number}|null>(navKey,null);
    const center=saved?.center??cityCenter??location??[44.4268,26.1025];
    return {center:{latitude:center[0],longitude:center[1]},zoom:saved?.zoom??zoomForDistance(distanceKm)};
  },[navKey,cityCenter?.[0],cityCenter?.[1],location?.[0],location?.[1],distanceKm]);
  const [locateRevision,setLocateRevision]=useState(0);
  const handleLocation=useCallback((value:Coordinates)=>{setLocation(value);onUserLocationChange?.(value);},[onUserLocationChange]);
  useEffect(()=>{const query=window.matchMedia('(max-width:1023px)');const update=()=>setMobile(query.matches);update();query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);
  useEffect(()=>{if(userLocationProp)setLocation(userLocationProp);},[userLocationProp]);
  useEffect(()=>{let cancelled=false;requestCurrentLocation({enableHighAccuracy:true,maximumAge:0,timeout:20000}).then(value=>{if(!cancelled)handleLocation(value);}).catch(()=>{});return()=>{cancelled=true;};},[]);
  useEffect(()=>{if(focusRequest)setFocus({id:focusRequest.eventId,revision:focusRequest.requestId});},[focusRequest]);
  useEffect(()=>{if(selectedId&&!selectedEvent)setSelectedId(null);},[selectedId,selectedEvent,setSelectedId]);
  useEffect(()=>{
    const node=rail.current;if(!node||!mobile)return;
    const update=()=>setCarouselHeight(node.offsetHeight);update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();
  },[mobile,mapEvents.length>0]);
  useEffect(()=>{
    const fromRail=railSelection.current===activeId;railSelection.current=null;
    if(fromRail||!mobile||!activeId)return;
    const node=rail.current,card=cards.current.get(activeId);
    if(node&&card)node.scrollTo({left:card.offsetLeft-16,behavior:'instant'});
  },[activeId,mobile]);
  useEffect(()=>()=>{if(scrollTimer.current)clearTimeout(scrollTimer.current);},[]);
  useEffect(()=>{
    if(locateRevision&&map&&location)map.flyTo({center:[location[1],location[0]],zoom:Math.max(14,map.getZoom()),duration:400});
  },[locateRevision,map,location]);
  const desktopHeight=desktopFillViewport?"lg:h-[calc(100dvh-200px)] lg:min-h-0":"lg:h-[78vh] lg:min-h-[640px]";
  const mapSize=fullScreenOnMobile?`h-dvh rounded-none ${desktopHeight} lg:rounded-[24px] lg:border lg:border-white/10`:`h-[72vh] min-h-[520px] rounded-[24px] border border-white/10 ${desktopHeight}`;
  const attributionBottom=mobile?(mapEvents.length?carouselHeight+112:112):0;
  return <div className={`relative w-full overflow-hidden bg-black ${mapSize} ${carouselStyle.host}`} style={{'--map-carousel-height':`${mapEvents.length?carouselHeight:0}px`,'--map-attribution-bottom':`${attributionBottom}px`} as React.CSSProperties}>
    <VectorEventMap events={mapEvents} center={initial.center} zoom={initial.zoom} selected={mobile?activeId??null:selectedId}
      location={vectorLocation} focus={focus} attributionBottom={attributionBottom}
      onReady={setMap} onSelect={id=>choose(id)} onSelectedPoint={mobile?()=>{}:setPoint} onBounds={onBoundsEventsChange}
      onViewport={(center,zoom)=>writeNavigationState(navKey,{center:[center.latitude,center.longitude],zoom})}
      clusterLabel={count=>t('eventMap.cluster',{count})} label={t('eventMap.map')} errorLabel={t('feedback.loadFailed')} retryLabel={t('common.retry')}/>
    <MapControls onLocate={value=>{handleLocation(value);setLocateRevision(value=>value+1);}} onZoomIn={()=>map?.zoomIn()} onZoomOut={()=>map?.zoomOut()} isFullView={isFullView} onToggleFullView={onToggleFullView}/>
    {!mobile&&selectedEvent&&point&&<SelectedEventPopup event={selectedEvent} position={point} onClose={()=>choose(null)} onOpen={()=>open(selectedEvent)}/>}
      {mapEvents.length > 0 && <div ref={rail} data-testid="map-events-carousel" className={carouselStyle.rail}
        role="group" aria-label={t('eventMap.map')}
        onScroll={() => {
          if(!mobile)return;
          if(scrollTimer.current)clearTimeout(scrollTimer.current);
          scrollTimer.current=setTimeout(() => {
            scrollTimer.current=null;
            const node=rail.current;if(!node)return;
            const nearest=mapEvents.reduce<Event|null>((result,item)=>{
              const current=cards.current.get(item.id),previous=result&&cards.current.get(result.id);
              return current&&(!previous||Math.abs(current.offsetLeft-16-node.scrollLeft)<Math.abs(previous.offsetLeft-16-node.scrollLeft))?item:result;
            },null);
            if(nearest&&nearest.id!==activeId){railSelection.current=nearest.id;choose(nearest.id,true);}
          },140);
        }}>
        {mapEvents.map(event=><button key={event.id} type="button" data-testid={'map-event-card-'+event.id}
          ref={node=>{if(node)cards.current.set(event.id,node);else cards.current.delete(event.id);}}
          className={carouselStyle.card} aria-current={event.id===activeId?'true':undefined}
          aria-label={`${t('events.viewEvent')}: ${event.title}. ${formatEventDateShort(event.startTime)} · ${formatEventTime(event.startTime)}. ${event.locationName||event.city||''}`}
          onClick={()=>{choose(event.id,true);open(event);}}>
          <span className={carouselStyle.copy}>
            <strong className={`${carouselStyle.title} line-clamp-2`}>{event.title}</strong>
            <span className={carouselStyle.meta}>{formatEventDateShort(event.startTime)} · {formatEventTime(event.startTime)}</span>
            <span className={`${carouselStyle.meta} ${carouselStyle.location}`}>{event.locationName||event.city}</span>
            <span className={carouselStyle.action}>{t('events.viewEvent')} →</span>
          </span>
          <Image src={event.bannerUrl||'/party-event.webp'} alt="" width={72} height={104} sizes="72px" className={carouselStyle.image}/>
        </button>)}
      </div>}
    {!mapEvents.length&&<div className="pointer-events-none absolute inset-0 z-[1] grid place-items-center"><p className="rounded-xl border border-white/10 bg-black/80 p-4 text-sm text-muted-foreground">{t('common.noEvents')}</p></div>}
  </div>;
}
