import { validCoordinate, type Coordinate, type Point } from '../geometry';

export type WebMapEvent = Coordinate & { id: string; title: string; live: boolean };
export type WebMapState = {
  events: WebMapEvent[];
  center: Coordinate;
  zoom: number;
  location: Coordinate | null;
  selected: string | null;
  attributionBottom: number;
  focus: { id: string; revision: number } | null;
  reducedMotion: boolean;
  label: string;
  clusterLabel: string;
};
export type WebMapMessage =
  | { type: 'ready' }
  | { type: 'error'; failed: boolean }
  | { type: 'select'; id: string | null }
  | { type: 'viewport'; center: Coordinate; zoom: number }
  | { type: 'point'; point: Point | null };

export function parseMapMessage(raw: string): WebMapMessage | null {
  try {
    const message = JSON.parse(raw);
    if (!message || typeof message !== 'object') return null;
    switch (message.type) {
      case 'ready': return { type: 'ready' };
      case 'error': return typeof message.failed === 'boolean' ? { type: 'error', failed: message.failed } : null;
      case 'select': return message.id === null || typeof message.id === 'string' ? { type: 'select', id: message.id } : null;
      case 'viewport': return validCoordinate(message.center) && Number.isFinite(message.zoom) && message.zoom >= 3 && message.zoom <= 20
        ? { type: 'viewport', center: message.center, zoom: message.zoom } : null;
      case 'point': return message.point === null || message.point && Number.isFinite(message.point.x) && Number.isFinite(message.point.y)
        ? { type: 'point', point: message.point } : null;
      default: return null;
    }
  } catch { return null; }
}

export function isMapDocument(url: string) {
  return url === 'about:blank' || url === 'about:srcdoc' || url === 'https://spottr-map.invalid/';
}
export function isMapCredit(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      ['openfreemap.org', 'openmaptiles.org', 'www.openmaptiles.org', 'www.openstreetmap.org', 'openstreetmap.org'].includes(parsed.hostname);
  } catch { return false; }
}
