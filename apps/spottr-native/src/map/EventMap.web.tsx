import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { eventMapStyles } from '../../../pulse-app/src/features/events/map/eventMapStyles';
import { clusterEvents, clusterZoom, radialPositions, TILE_URL, type Coordinate } from './geometry';
import { isLive } from '../data/events';
import type { Event } from '../data/events';
import type { EventMapProps } from './types';

export function EventMap(props: EventMapProps) {
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<L.Map | null>(null), latest = useRef(props); latest.current = props;
  const renderRef = useRef<() => void>(() => {});
  useEffect(() => {
    const map = L.map(container.current!, { zoomControl: false, zoomAnimation: false, minZoom: 3, maxZoom: 20 }).setView([latest.current.center.latitude, latest.current.center.longitude], latest.current.zoom);
    mapRef.current = map;
    L.tileLayer(TILE_URL, { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>', maxZoom: 20 }).addTo(map);
    const markers = L.layerGroup().addTo(map);
    let selectedPosition: Coordinate | null = null;
    const updatePoint = () => {
      const p = latest.current, center = map.getCenter();
      p.onViewport({ latitude: center.lat, longitude: center.lng }, map.getZoom());
      p.onSelectedPoint(selectedPosition ? map.latLngToContainerPoint([selectedPosition.latitude, selectedPosition.longitude]) : null);
    };
    const render = () => {
      markers.clearLayers(); selectedPosition = null;
      const p = latest.current;
      const pin = (event: Event, coordinate: Coordinate, radial = false) => {
        const active = event.id === p.selected, live = isLive(event), size = active ? 46 : 40;
        if (active) selectedPosition = coordinate;
        const html = `<div class="event-map-pin event-map-pin--${active ? 'selected' : 'default'} ${live ? 'event-map-pin--live' : ''} ${radial ? 'event-map-pin--spiderfied' : ''}" style="width:${size}px;height:${size}px">${live ? '<span class="event-map-pin__pulse"></span>' : ''}<div class="event-map-pin__shape"><svg class="event-map-pin__icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div></div>`;
        L.marker([coordinate.latitude, coordinate.longitude], { icon: L.divIcon({ html, className: 'custom-leaflet-marker', iconSize: [size, size], iconAnchor: [size / 2, size - 3] }), title: event.title, zIndexOffset: active ? 1000 : radial ? 900 : 0 }).on('click', e => { L.DomEvent.stopPropagation(e.originalEvent); p.onSelect(event.id); }).addTo(markers);
      };
      for (const cluster of clusterEvents(p.events, map.getZoom())) {
        const count = cluster.events.length;
        if (count === 1) pin(cluster.events[0]!, cluster);
        else if (map.getZoom() > 17) radialPositions(cluster, map.getZoom()).forEach(row => pin(row.event, row.coordinate, true));
        else {
          const size = count >= 100 ? 56 : count >= 10 ? 50 : 44;
          L.marker([cluster.latitude, cluster.longitude], { icon: L.divIcon({ html: `<div class="event-map-cluster" style="width:${size}px;height:${size}px"><span>${count}</span></div>`, className: 'custom-leaflet-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), title: String(count) }).on('click', e => {
            L.DomEvent.stopPropagation(e.originalEvent);
            if (clusterZoom(cluster, map.getZoom()) === 18) map.setView([cluster.latitude, cluster.longitude], 18);
            else map.fitBounds(L.latLngBounds(cluster.events.map(event => [event.latitude!, event.longitude!] as L.LatLngTuple)), { padding: [64, 64], maxZoom: 18 });
          }).addTo(markers);
        }
      }
      if (p.location) L.circleMarker([p.location.latitude, p.location.longitude], { radius: 7, color: 'white', weight: 2, fillColor: '#ff0044', fillOpacity: 1 }).addTo(markers);
      updatePoint();
    };
    renderRef.current = render; render(); map.on('zoomend', render); map.on('move', updatePoint); map.on('click', () => latest.current.onSelect(null));
    const observer = new ResizeObserver(() => { map.invalidateSize(); updatePoint(); }); observer.observe(container.current!);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; renderRef.current = () => {}; };
  }, []);
  useEffect(() => { mapRef.current?.setView([props.center.latitude, props.center.longitude], props.zoom); }, [props.center.latitude, props.center.longitude, props.zoom]);
  useEffect(() => renderRef.current(), [props.events, props.location, props.selected]);
  return <><style>{eventMapStyles}</style><div data-testid="event-map" ref={container} style={{ position: 'absolute', inset: 0, zIndex: 0, '--primary': '#ff0044', '--primary-foreground': '#fff' } as React.CSSProperties} /></>;
}
