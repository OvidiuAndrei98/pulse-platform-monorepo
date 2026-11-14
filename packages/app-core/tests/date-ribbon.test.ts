import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRibbonCalendar, dateRibbonDayAt, dateRibbonDayIndex, dateRibbonEventDays, dateRibbonIndex, dateRibbonSelection, dateRibbonWindow, withRibbonDay, withoutRibbonDay } from '../src/events/dateRibbon';
import { shiftCalendarDay } from '../src/events/discoveryFilters';
import { getEventDateRange } from '../src/events/dateFilters';
import { defaultEventFilters } from '../src/events/constants';

test('scroll positions remain absolute across fast multi-month travel, year boundaries and DST', () => {
  const calendar = dateRibbonCalendar('2026-11-05');
  assert.ok(calendar.count > 25_000);
  for (const index of [0, 80, 180, 400, 730, 5, 1000, calendar.count - 1]) {
    const day = dateRibbonDayAt(calendar, index);
    assert.equal(day, shiftCalendarDay(calendar.first, index));
    assert.equal(dateRibbonDayIndex(calendar, day), index, 'Scrolling never changes the origin or needs a rebase');
  }
  assert.equal(dateRibbonDayAt(calendar, calendar.count - 1), '2100-12-31');
  assert.equal(dateRibbonDayIndex(calendar, '2026-11-04'), -1);
  assert.equal(dateRibbonDayIndex(calendar, 'invalid'), -1);
  const dst = dateRibbonCalendar('2028-03-25');
  assert.equal(dateRibbonDayAt(dst, 1), '2028-03-26');
  assert.equal(dateRibbonDayIndex(dst, '2028-03-27'), 2);
});

test('availability ignores the selected date and uses Bucharest interval overlap, including DST and midnight boundaries', () => {
  const days = ['2028-03-25', '2028-03-26', '2028-03-27', '2028-03-28'];
  const event = { id: 'night', title: 'Night', startTime: '2028-03-25T23:30:00+02:00', endTime: '2028-03-27T00:00:00+03:00' };
  const now = new Date('2028-03-25T09:00:00Z');
  const filters = { ...defaultEventFilters, date: 'Custom', dateFrom: days[3], dateTo: days[3] };
  assert.deepEqual([...dateRibbonEventDays([event], days, filters, null, now)], days.slice(0, 2));
  assert.deepEqual([...dateRibbonEventDays([event], days, filters, null, new Date('2028-03-26T12:00:00Z'))], [days[1]]);
  assert.equal(dateRibbonEventDays([event], days, filters, null, new Date(event.endTime)).size, 0);
});

test('availability applies the same search, category, vibe, city and distance filters as Discovery', () => {
  const day = '2028-11-08', now = new Date('2028-11-01T12:00:00Z');
  const event = { id: 'house', title: 'House night', category: 'HOUSE', vibe: 'Indoor', city: 'Bucuresti',
    latitude: 44.4268, longitude: 26.1025, startTime: day + 'T18:00:00Z', endTime: day + 'T22:00:00Z' };
  const filters = { ...defaultEventFilters, city: 'Bucuresti', categories: ['HOUSE'], vibes: ['Indoor'], q: '  House  ', distance: 5 };
  const result = (changes = {}, center: readonly [number, number] | null = [44.4268, 26.1025]) =>
    dateRibbonEventDays([event], [day], { ...filters, ...changes }, center, now).has(day);
  assert.equal(result(), true);
  for (const changes of [{ city: 'Cluj-Napoca' }, { categories: ['TECHNO'] }, { vibes: ['Outdoor'] }, { q: 'missing' }]) assert.equal(result(changes), false);
  assert.equal(result({}, [46.7712, 23.6236]), false);
  assert.equal(dateRibbonEventDays([{ ...event, endTime: 'bad' }], [day], filters, null, now).size, 0);
  assert.equal(dateRibbonEventDays([], [day], filters, null, now).size, 0);
});

test('the endless ribbon keeps a bounded consecutive window across months, leap days and years', () => {
  const today = '2026-11-03';
  for (const day of ['2026-11-03', '2026-12-31', '2028-02-29', '2100-12-31']) {
    const days = dateRibbonWindow(day, today);
    assert.ok(days.length <= 91 && days.includes(day));
    assert.ok(days[0]! >= today && days.at(-1)! <= '2100-12-31');
    days.slice(1).forEach((value, index) => assert.equal(value, shiftCalendarDay(days[index]!, 1)));
  }
  assert.equal(dateRibbonWindow('bad', today)[0], today);
  assert.equal(dateRibbonWindow('2026-01-01', today)[0], today);
  let current = shiftCalendarDay(today, 60);
  for (let index = 0; index < 60; index++) {
    current = shiftCalendarDay(current, 40);
    const days = dateRibbonWindow(current, today);
    assert.equal(days.length, 91);
    assert.equal(days[45], current, 'recentering preserves the day at the center');
  }
});

test('single-day selection preserves search, categories, city and distance and does not refetch an unchanged date', () => {
  const filters = { ...defaultEventFilters, q: 'House', city: 'Bucuresti', categories: ['HOUSE'], distance: 25 };
  const selected = withRibbonDay(filters, '2028-03-26', '2026-11-03');
  assert.deepEqual(selected, { ...filters, date: 'Custom', dateFrom: '2028-03-26', dateTo: '2028-03-26' });
  assert.equal(withRibbonDay(selected, '2028-03-26', '2026-11-03'), selected);
  assert.equal(withRibbonDay(filters, '2026-11-02', '2026-11-03'), filters);
  assert.equal(withRibbonDay(filters, 'bad', '2026-11-03'), filters);
  const range = getEventDateRange(selected.date, selected);
  assert.equal((Date.parse(range.startsBefore!) - Date.parse(range.startsAfter!)) / 3_600_000, 23, 'Romanian daylight saving is retained');
  assert.deepEqual(withoutRibbonDay(selected), { ...filters, date: 'See all', dateFrom: '', dateTo: '' });
});

test('snap calculations clamp overscroll and quick date filters initialize the same calendar', () => {
  assert.equal(dateRibbonIndex(-20, 91), 0);
  assert.equal(dateRibbonIndex(44 * 2 + 21, 91), 2);
  assert.equal(dateRibbonIndex(44 * 2 + 23, 91), 3);
  assert.equal(dateRibbonIndex(1e8, 91), 90);
  assert.equal(dateRibbonSelection({ ...defaultEventFilters, date: 'Tomorrow' }, '2026-12-31'), '2027-01-01');
  assert.equal(dateRibbonSelection(defaultEventFilters, '2026-12-31'), '');
});
