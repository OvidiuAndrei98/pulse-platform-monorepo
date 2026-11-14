import { DISCOVERY_TIME_ZONE, eventMatchesSearch, eventWithinDistance, normalizeDiscoverySearch, shiftCalendarDay, validCalendarDay } from './discoveryFilters';
import type { EventFilters } from './types';

export const DATE_RIBBON_DAY_WIDTH = 44;
export const DATE_RIBBON_RADIUS = 45;
export const DATE_RIBBON_CONTEXT_DAYS = 7;
const LAST_DAY = '2100-12-31';
const DAY_MS = 86_400_000;

export type DateRibbonCalendar = { first: string; count: number };

/** Stable scroll coordinates; only visible cells need to be materialized. */
export function dateRibbonCalendar(first: string): DateRibbonCalendar {
  if (!validCalendarDay(first)) throw new RangeError('Invalid calendar origin');
  return { first, count: Math.round((Date.parse(LAST_DAY + 'T12:00:00Z') - Date.parse(first + 'T12:00:00Z')) / DAY_MS) + 1 };
}

export function dateRibbonDayAt(calendar: DateRibbonCalendar, index: number) {
  return shiftCalendarDay(calendar.first, Math.max(0, Math.min(calendar.count - 1, Math.round(index))));
}

export function dateRibbonDayIndex(calendar: DateRibbonCalendar, day: string) {
  if (!validCalendarDay(day) || day < calendar.first || day > LAST_DAY) return -1;
  return Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(calendar.first + 'T12:00:00Z')) / DAY_MS);
}

type RibbonEvent = {
  id: string; title: string; startTime: string; endTime: string;
  city?: string; locationName?: string; category?: string; vibe?: string;
  latitude?: number | null; longitude?: number | null;
};

/** Use a complete event catalogue, independently of the currently selected date.
 * Interval overlap matches Discovery, including events continuing after midnight. */
export function dateRibbonEventRanges(events: readonly RibbonEvent[], filters: EventFilters,
  center: readonly [number, number] | null = null, now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISCOVERY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const calendarDay = (time: number) => {
    const parts = formatter.formatToParts(new Date(time));
    const get = (type: string) => parts.find(part => part.type === type)!.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const query = normalizeDiscoverySearch(filters.q ?? '');
  return events.flatMap(event => {
    const start = Date.parse(event.startTime), end = Date.parse(event.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now.getTime()
      || filters.city && event.city !== filters.city
      || filters.categories.length && !filters.categories.includes(event.category ?? '')
      || filters.vibes.length && !filters.vibes.includes(event.vibe ?? '')
      || !eventMatchesSearch(event, query) || !eventWithinDistance(event, center, filters.distance)) return [];
    return [{ first: calendarDay(Math.max(start, now.getTime())), last: calendarDay(end - 1) }];
  });
}

/** Mapping another ribbon window never re-filters or re-formats the catalogue. */
export function dateRibbonDaysInRanges(ranges: readonly { first: string; last: string }[], days: readonly string[]) {
  return new Set(days.filter(day => ranges.some(range => day >= range.first && day <= range.last)));
}

export function dateRibbonEventDays(events: readonly RibbonEvent[], days: readonly string[], filters: EventFilters,
  center: readonly [number, number] | null = null, now = new Date()) {
  return dateRibbonDaysInRanges(dateRibbonEventRanges(events, filters, center, now), days);
}

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
