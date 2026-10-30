"use client";

import { useEffect, useRef, useState } from 'react';
import { Map as LibreMap, Marker, AttributionControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import { clusterEvents, clusterZoom, radialPositions, validCoordinate, type Coordinate, type Point } from '../../../../../spottr-native/src/map/geometry';
import darkStyle from './openFreeMapDark.json';
import 'maplibre-gl/dist/maplibre-gl.css';
import './vectorMap.css';

export type MapEvent = { id: string; title: string; latitude?: number | null; longitude?: number | null; startTime?: string; endTime?: string; isLive?: boolean };
export type MapFocus = { id: string; revision: number };
export type VectorEventMapProps = {
  events: readonly MapEvent[]; center: Coordinate; zoom: number; selected: string | null;
  location: Coordinate | null; focus?: MapFocus | null; attributionBottom?: number;
  onSelect: (id: string | null) => void; onViewport: (center: Coordinate, zoom: number) => void;
  onSelectedPoint: (point: Point | null) => void; onBounds?: (ids: string[]) => void;
  onReady?: (map: LibreMap | null) => void; label: string; errorLabel: string; retryLabel: string;
  clusterLabel: (count: number) => string;
};

// Only a constant SVG is constructed. Event names are assigned through DOM
// attributes, never HTML, and never appear in provider requests.
function pinIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>';
  return svg;
}

export function VectorEventMap(props: VectorEventMapProps) {
  const host = useRef<HTMLDivElement>(null), mapRef = useRef<LibreMap | null>(null), latest = useRef(props);
  latest.current = props;
  const [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false);
  const renderRef = useRef<() => void>(() => {}), focusRef = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    const markers = new Map<string, Marker>();
    const node = host.current!;
    setFailed(false);
    setWorkerUrl(new URL('/maplibre-worker.mjs', window.location.href).href);
    let map: LibreMap;
    try {
      map = new LibreMap({ container: node, style: JSON.parse(JSON.stringify(darkStyle)) as StyleSpecification,
        center: [latest.current.center.longitude, latest.current.center.latitude], zoom: latest.current.zoom,
        pitch: 45, minZoom: 3, maxZoom: 20, maxPitch: 60, attributionControl: false,
        canvasContextAttributes: { antialias: true } });
    } catch {
      setFailed(true); node.replaceChildren(); return;
    }
    mapRef.current = map;
    map.addControl(new AttributionControl({ compact: false }), 'bottom-right');
    latest.current.onReady?.(map);
    let selectedCoordinate: Coordinate | undefined;
    let visibleIds: string[] | undefined;
    let errorTimer: ReturnType<typeof setTimeout> | undefined;
    const move = () => {
      if (disposed) return;
      const center = map.getCenter();
      node.dataset.zoom = String(map.getZoom()); node.dataset.pitch = String(map.getPitch());
      node.dataset.latitude = String(center.lat); node.dataset.longitude = String(center.lng);
      const point = selectedCoordinate && map.project([selectedCoordinate.longitude, selectedCoordinate.latitude]);
      latest.current.onSelectedPoint(point ? { x: point.x, y: point.y } : null);
    };
    const render = () => {
      if (disposed) return;
      const p = latest.current, keep = new Set<string>(), level = map.getZoom();
      const events = p.events.filter(event => validCoordinate(event as Coordinate));
      selectedCoordinate = undefined;
      const marker = (key: string, coordinate: Coordinate, title: string, selected: boolean, count?: number, live = false, radial = false) => {
        keep.add(key);
        let item = markers.get(key);
        if (!item) {
          const button = document.createElement('button'); button.type = 'button';
          button.className = count ? 'spottr-map-cluster' : 'spottr-map-pin';
          if (count) button.textContent = String(count); else button.append(pinIcon());
          item = new Marker({ element: button, anchor: 'center' }).setLngLat([coordinate.longitude, coordinate.latitude]).addTo(map);
          markers.set(key, item);
        }
        const button = item.getElement() as HTMLButtonElement;
        button.setAttribute('aria-label', title); button.title = title;
        button.setAttribute('aria-pressed', String(selected)); button.dataset.selected = String(selected);
        button.dataset.live = String(live); button.dataset.radial = String(radial);
        button.dataset.testid = count ? 'map-cluster-'+count : 'map-pin-'+key;
        button.style.zIndex = selected ? '10' : '1';
        item.setLngLat([coordinate.longitude, coordinate.latitude]);
        return button;
      };
      // MapLibre uses a 512px world tile; the shared geometry uses 256px.
      for (const cluster of clusterEvents(events, level + 1)) {
        if (cluster.events.length > 1 && level <= 17) {
          const button = marker('cluster:'+cluster.events.map(e => e.id).sort().join(','), cluster, p.clusterLabel(cluster.events.length), false, cluster.events.length);
          button.onclick = event => { event.stopPropagation(); map.flyTo({ center: [cluster.longitude, cluster.latitude], zoom: clusterZoom(cluster, level), duration: 450 }); };
          continue;
        }
        const rows = cluster.events.length === 1 ? [{ event: cluster.events[0]!, coordinate: cluster }] : radialPositions(cluster, level + 1);
        for (const { event, coordinate } of rows) {
          const selected = event.id === p.selected;
          if (selected) selectedCoordinate = coordinate;
          const live = event.isLive === true || (Date.parse(event.startTime ?? '') <= Date.now() && Date.parse(event.endTime ?? '') > Date.now());
          const button = marker(event.id, coordinate, event.title, selected, undefined, live, rows.length > 1);
          button.onclick = click => { click.stopPropagation(); latest.current.onSelect(event.id); };
        }
      }
      if (validCoordinate(p.location)) {
        const key = 'user-location'; keep.add(key);
        let marker = markers.get(key);
        if (!marker) { const dot = document.createElement('span'); dot.className='spottr-map-location'; dot.setAttribute('aria-hidden','true'); marker=new Marker({element:dot}).setLngLat([p.location.longitude,p.location.latitude]).addTo(map); markers.set(key,marker); }
        marker.setLngLat([p.location.longitude,p.location.latitude]);
      }
      for (const [id, marker] of markers) if (!keep.has(id)) { marker.remove(); markers.delete(id); }
      move();
      const center=map.getCenter();
      p.onViewport({latitude:center.lat,longitude:center.lng},level);
      const bounds = map.getBounds();
      const ids=events.filter(event => bounds.contains([event.longitude!,event.latitude!])).map(event=>event.id);
      if(!visibleIds||ids.length!==visibleIds.length||ids.some((id,index)=>id!==visibleIds![index])){
        visibleIds=ids;p.onBounds?.(ids);
      }
    };
    const focus = () => {
      const p = latest.current, event = p.events.find(event => event.id === p.focus?.id);
      if (!event || !validCoordinate(event as Coordinate)) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.flyTo({ center: [event.longitude!, event.latitude!], zoom: Math.max(18, map.getZoom()), pitch: 50,
        offset: [0, -Math.min(node.clientHeight*.2, (p.attributionBottom ?? 0)*.5)], duration: reduced ? 0 : 550 });
    };
    renderRef.current=render; focusRef.current=focus;
    const failed = (event: unknown) => {
      const sourceId=event&&typeof event==='object'&&'sourceId' in event?event.sourceId:undefined;
      if(disposed||errorTimer||sourceId!=='openmaptiles'&&map.isStyleLoaded())return;
      errorTimer=setTimeout(()=>{errorTimer=undefined;if(!disposed)setFailed(true);},1200);
    };
    const recovered = (event:{sourceId?:string;sourceDataType?:string}) => {
      if(disposed||event.sourceId!=='openmaptiles'||event.sourceDataType!=='content')return;
      if(errorTimer)clearTimeout(errorTimer);errorTimer=undefined;setFailed(false);
    };
    const loaded = () => { if (!disposed) { render(); focus(); } };
    const dismiss = () => latest.current.onSelect(null);
    map.on('error',failed); map.on('sourcedata',recovered); map.on('load',loaded); map.on('move',move); map.on('moveend',render); map.on('click',dismiss);
    const observer = new ResizeObserver(() => { if (!disposed) { map.resize(); move(); } }); observer.observe(node);
    render();
    return () => {
      disposed=true; if(errorTimer)clearTimeout(errorTimer); observer.disconnect(); renderRef.current=()=>{}; focusRef.current=()=>{};
      markers.forEach(marker => marker.remove()); markers.clear(); map.remove(); mapRef.current=null;
      latest.current.onReady?.(null);
    };
  }, [attempt]);
  useEffect(() => { mapRef.current?.flyTo({ center:[props.center.longitude,props.center.latitude],zoom:props.zoom,duration:250 }); }, [props.center.latitude,props.center.longitude,props.zoom]);
  useEffect(() => { renderRef.current(); }, [props.events,props.selected,props.location]);
  useEffect(() => { focusRef.current(); }, [props.focus?.id,props.focus?.revision]);
  useEffect(() => {
    const position=host.current?.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-right');
    if(position)position.style.bottom=`${props.attributionBottom??0}px`;
  }, [props.attributionBottom,attempt]);
  return <>
    <div ref={host} data-testid="event-map" role="region" aria-label={props.label} className="spottr-vector-map" />
    {failed && <div role="status" className="spottr-map-error"><span>{props.errorLabel}</span><button type="button" onClick={()=>setAttempt(value=>value+1)}>{props.retryLabel}</button></div>}
  </>;
}
