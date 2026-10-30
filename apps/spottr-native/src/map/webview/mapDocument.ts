import { Map as LibreMap, Marker, AttributionControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import darkStyle from '../../../../pulse-app/src/features/events/map/openFreeMapDark.json';
import { clusterEvents, clusterZoom, radialPositions, validCoordinate, type Coordinate } from '../geometry';
import type { WebMapMessage, WebMapState } from './bridge';

declare const __SPOTTR_MAP_WORKER__: string;
declare global { interface Window { ReactNativeWebView?: { postMessage(message: string): void } } }

const host = document.getElementById('map')!;
const workerUrl = URL.createObjectURL(new Blob([__SPOTTR_MAP_WORKER__], { type: 'text/javascript' }));
setWorkerUrl(workerUrl);
const markers = new Map<string, Marker>();
let map: LibreMap | undefined, state: WebMapState | undefined;
let selectedCoordinate: Coordinate | undefined, lastPoint = '', lastFocus = '';
let errorTimer: ReturnType<typeof setTimeout> | undefined;
function send(message: WebMapMessage) { window.ReactNativeWebView?.postMessage(JSON.stringify(message)); }
function point() {
  const position = map && selectedCoordinate && map.project([selectedCoordinate.longitude, selectedCoordinate.latitude]);
  const next = position ? { x: position.x, y: position.y } : null;
  // Avoid bridging the same selection point on every idle render.
  const key = JSON.stringify(next);
  if (key !== lastPoint) { lastPoint = key; send({ type: 'point', point: next }); }
}
function pinIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>';
  return svg;
}
function render() {
  if (!map || !state) return;
  const level = map.getZoom(), keep = new Set<string>();
  selectedCoordinate = undefined;
  const marker = (key: string, coordinate: Coordinate, title: string, selected: boolean, count?: number, live = false) => {
    keep.add(key);
    let item = markers.get(key);
    if (!item) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = count ? 'spottr-map-cluster' : 'spottr-map-pin';
      if (count) button.textContent = String(count); else button.append(pinIcon());
      item = new Marker({ element: button, anchor: 'center' }).setLngLat([coordinate.longitude, coordinate.latitude]).addTo(map!);
      markers.set(key, item);
    }
    const button = item.getElement() as HTMLButtonElement;
    // User-provided event names remain text, never HTML or executable script.
    button.setAttribute('aria-label', title); button.title = title;
    button.setAttribute('aria-pressed', String(selected)); button.dataset.selected = String(selected);
    button.dataset.live = String(live); button.dataset.testid = count ? 'map-cluster-' + count : 'map-pin-' + key;
    button.style.zIndex = selected ? '10' : '1';
    item.setLngLat([coordinate.longitude, coordinate.latitude]);
    return button;
  };
  for (const cluster of clusterEvents(state.events, level + 1)) {
    if (cluster.events.length > 1 && level <= 17) {
      const count = cluster.events.length;
      const button = marker('cluster:' + cluster.key, cluster, state.clusterLabel.replace('{count}', String(count)), false, count);
      button.onclick = click => {
        click.stopPropagation();
        map!.flyTo({ center: [cluster.longitude, cluster.latitude], zoom: clusterZoom(cluster, map!.getZoom()), duration: state!.reducedMotion ? 0 : 450 });
      };
      continue;
    }
    const rows = cluster.events.length === 1 ? [{ event: cluster.events[0]!, coordinate: cluster }] : radialPositions(cluster, level + 1);
    for (const { event, coordinate } of rows) {
      const selected = state.selected === event.id;
      if (selected) selectedCoordinate = coordinate;
      const button = marker(event.id, coordinate, event.title, selected, undefined, event.live);
      button.onclick = click => { click.stopPropagation(); send({ type: 'select', id: event.id }); };
    }
  }
  if (validCoordinate(state.location)) {
    const key = 'user-location'; keep.add(key);
    let item = markers.get(key);
    if (!item) {
      const dot = document.createElement('span'); dot.className = 'spottr-map-location'; dot.setAttribute('aria-hidden', 'true');
      item = new Marker({ element: dot }).setLngLat([state.location.longitude, state.location.latitude]).addTo(map);
      markers.set(key, item);
    }
    item.setLngLat([state.location.longitude, state.location.latitude]);
  }
  for (const [key, item] of markers) if (!keep.has(key)) { item.remove(); markers.delete(key); }
  const attribution = host.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-right');
  if (attribution) attribution.style.bottom = `${state.attributionBottom}px`;
  host.setAttribute('aria-label', state.label);
  point();
}
function focus() {
  if (!map || !state?.focus) return false;
  const key = JSON.stringify(state.focus);
  if (key === lastFocus) return false;
  const event = state.events.find(event => event.id === state!.focus!.id);
  if (!event) return false;
  lastFocus = key;
  map.flyTo({ center: [event.longitude, event.latitude], zoom: Math.max(18, map.getZoom()), pitch: 50,
    padding: { top: Math.min(80, host.clientHeight * .12), right: 36, left: 36,
      bottom: Math.max(0, Math.min(state.attributionBottom + 24, host.clientHeight - 80)) },
    duration: state.reducedMotion ? 0 : 550 });
  return true;
}
function viewport() {
  if (!map) return;
  render();
  const center = map.getCenter();
  host.dataset.latitude = String(center.lat); host.dataset.longitude = String(center.lng);
  host.dataset.zoom = String(map.getZoom()); host.dataset.pitch = String(map.getPitch());
  send({ type: 'viewport', center: { latitude: center.lat, longitude: center.lng }, zoom: map.getZoom() });
}
function create() {
  try {
    map = new LibreMap({ container: host, style: darkStyle as unknown as StyleSpecification,
      center: [state!.center.longitude, state!.center.latitude], zoom: state!.zoom, pitch: 45,
      minZoom: 3, maxZoom: 20, maxPitch: 60, attributionControl: false,
      canvasContextAttributes: { antialias: true } });
    map.addControl(new AttributionControl({ compact: false }), 'bottom-right');
    map.on('move', point); map.on('moveend', viewport);
    map.on('click', () => send({ type: 'select', id: null }));
    map.on('load', () => { send({ type: 'error', failed: false }); render(); focus(); });
    map.on('error', event => {
      const sourceId = 'sourceId' in event ? event.sourceId : undefined;
      if (errorTimer || sourceId !== 'openmaptiles' && map!.isStyleLoaded()) return;
      errorTimer = setTimeout(() => { errorTimer = undefined; send({ type: 'error', failed: true }); }, 1200);
    });
    map.on('sourcedata', event => {
      if (event.sourceId !== 'openmaptiles' || event.sourceDataType !== 'content') return;
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = undefined; send({ type: 'error', failed: false });
    });
    new ResizeObserver(() => { map?.resize(); point(); }).observe(host);
    render();
  } catch { send({ type: 'error', failed: true }); }
}
function receive(event: MessageEvent) {
  if (typeof event.data !== 'string') return;
  let next: WebMapState;
  try { next = JSON.parse(event.data); } catch { return; }
  if (!next || !Array.isArray(next.events) || !validCoordinate(next.center) || !Number.isFinite(next.zoom)) return;
  const previous = state;
  state = next;
  if (!map) { create(); return; }
  render();
  if (focus()) return;
  // A viewport acknowledgement from React must not restart a completed gesture.
  if (previous?.center.latitude === next.center.latitude && previous?.center.longitude === next.center.longitude && previous?.zoom === next.zoom) return;
  const center = map.getCenter();
  if (Math.abs(center.lat - next.center.latitude) < .000001 && Math.abs(center.lng - next.center.longitude) < .000001 && Math.abs(map.getZoom() - next.zoom) < .001) return;
  map.easeTo({ center: [next.center.longitude, next.center.latitude], zoom: next.zoom, duration: next.reducedMotion ? 0 : 250 });
}
// iOS dispatches on window; Android WebView versions also dispatch on document.
window.addEventListener('message', receive);
document.addEventListener('message', receive as EventListener);
send({ type: 'ready' });
