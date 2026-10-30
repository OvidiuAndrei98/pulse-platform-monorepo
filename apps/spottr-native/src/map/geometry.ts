import type { Event } from '../data/events';
export type MapCoordinateEvent = { id: string; latitude?: number | null; longitude?: number | null };
export type Coordinate = { latitude: number; longitude: number };
export const DEFAULT_CENTER: Coordinate = { latitude: 44.4323, longitude: 26.1063 };
export function validCoordinate(value: Coordinate | null | undefined): value is Coordinate {
  return !!value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}
export function project(point: Coordinate, zoom: number) {
  const size = 256 * 2 ** zoom, sin = Math.sin(Math.max(-85.0511, Math.min(85.0511, point.latitude)) * Math.PI / 180);
  return { x: (point.longitude + 180) / 360 * size, y: (.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}
export type Cluster<T extends MapCoordinateEvent = Event> = Coordinate & { events: T[]; key: string };
/** Same 58px clustering / 34px overlap thresholds as the Next.js map. */
export function clusterEvents<T extends MapCoordinateEvent>(events: readonly T[], zoom: number): Cluster<T>[] {
  const radius = zoom > 17 ? 34 : 58, clusters: Cluster<T>[] = [];
  for (const event of events) {
    if (!validCoordinate(event as Coordinate)) continue;
    const coordinate = event as T & Coordinate, point = project(coordinate, zoom);
    let nearest: Cluster<T> | undefined, distance = Infinity;
    for (const cluster of clusters) {
      const center = project(cluster, zoom), next = Math.hypot(center.x - point.x, center.y - point.y);
      if (next <= radius && next < distance) { nearest = cluster; distance = next; }
    }
    if (!nearest) clusters.push({ latitude: coordinate.latitude, longitude: coordinate.longitude, events: [event], key: event.id });
    else { const count = nearest.events.length; nearest.latitude = (nearest.latitude * count + coordinate.latitude) / (count + 1); nearest.longitude = (nearest.longitude * count + coordinate.longitude) / (count + 1); nearest.events.push(event); }
  }
  return clusters;
}
export function zoomForDistance(km: number) { return Math.max(3, Math.min(18, Math.log2(40075 / Math.max(1, km * 2)))) }
export type Point = { x: number; y: number };
export function unproject(point: Point, zoom: number): Coordinate {
  const size = 256 * 2 ** zoom;
  return { longitude: point.x / size * 360 - 180, latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * point.y / size))) * 180 / Math.PI };
}
/** Match the original map's rings so colocated events remain individually selectable. */
export function radialPositions<T extends MapCoordinateEvent>(cluster: Cluster<T>, zoom: number) {
  const center = project(cluster, zoom), result: { event: T; coordinate: Coordinate }[] = [];
  let index = 0, ring = 0;
  while (index < cluster.events.length) {
    const count = Math.min(ring === 0 ? 8 : 12 + (ring - 1) * 4, cluster.events.length - index);
    const radius = ring === 0 ? count <= 4 ? 28 : 38 : 68 + (ring - 1) * 34;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + 2 * Math.PI * i / count;
      result.push({ event: cluster.events[index + i]!, coordinate: unproject({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }, zoom) });
    }
    index += count; ring++;
  }
  return result;
}
export function clusterZoom(cluster: Cluster<MapCoordinateEvent>, current: number) {
  const first = cluster.events[0];
  const colocated = first && cluster.events.every(event => Math.abs(event.latitude! - first.latitude!) < .000001 && Math.abs(event.longitude! - first.longitude!) < .000001);
  return colocated ? Math.max(18, current) : Math.min(18, current + 2);
}
