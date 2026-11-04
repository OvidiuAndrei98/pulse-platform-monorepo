import { shiftCalendarDay, validCalendarDay } from './discoveryFilters';
import type { EventFilters } from './types';

export const DATE_RIBBON_DAY_WIDTH = 44;
export const DATE_RIBBON_RADIUS = 45;
export const DATE_RIBBON_CONTEXT_DAYS = 7;
const LAST_DAY = '2100-12-31';

/** Keep a bounded, replaceable window rather than accumulating years of cells. */
export function dateRibbonWindow(day: string, today: string) {
  const center = validCalendarDay(day) ? day < today ? today : day : today;
  const first = [today, shiftCalendarDay(center, -DATE_RIBBON_RADIUS)].sort().at(-1)!;
  return Array.from({ length: DATE_RIBBON_RADIUS * 2 + 1 }, (_, index) => shiftCalendarDay(first, index))
    .filter(value => value <= LAST_DAY);
}

export function dateRibbonIndex(offset: number, count: number) {
  return Math.max(0, Math.min(count - 1, Math.round(Math.max(0, offset) / DATE_RIBBON_DAY_WIDTH)));
}

export function dateRibbonSelection(filters: EventFilters, today: string) {
  if (filters.date === 'Custom' && validCalendarDay(filters.dateFrom)) return filters.dateFrom;
  if (filters.date === 'Tonight') return today;
  if (filters.date === 'Tomorrow') return shiftCalendarDay(today, 1);
  return '';
}

export function withRibbonDay(filters: EventFilters, day: string, today: string): EventFilters {
  if (!validCalendarDay(day) || day < today) return filters;
  if (filters.date === 'Custom' && filters.dateFrom === day && filters.dateTo === day) return filters;
  return { ...filters, date: 'Custom', dateFrom: day, dateTo: day };
}

export function withoutRibbonDay(filters: EventFilters): EventFilters {
  return { ...filters, date: 'See all', dateFrom: '', dateTo: '' };
}
