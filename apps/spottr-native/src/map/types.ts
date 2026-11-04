import type { Event } from '../data/events';
import type { Coordinate, Point } from '@packages/app-core/maps/geometry';
export type EventMapProps = {
  events: Event[]; center: Coordinate; zoom: number; location: Coordinate | null; selected: string | null;
  onSelect: (id: string | null) => void;
  onViewport: (center: Coordinate, zoom: number) => void;
  onSelectedPoint: (point: Point | null) => void;
  /** The containing map screen presents one compact notice for all failures. */
  onErrorChange?: (failed: boolean) => void;
  attributionBottom?: number;
  focus?: { id: string; revision: number } | null;
};
