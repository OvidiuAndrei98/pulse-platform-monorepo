import type { Event } from '../data/events';
import type { Coordinate, Point } from './geometry';
export type EventMapProps = {
  events: Event[]; center: Coordinate; zoom: number; location: Coordinate | null; selected: string | null;
  onSelect: (id: string | null) => void;
  onViewport: (center: Coordinate, zoom: number) => void;
  onSelectedPoint: (point: Point | null) => void;
};
