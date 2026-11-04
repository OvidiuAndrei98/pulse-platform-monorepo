import test from 'node:test';
import assert from 'node:assert/strict';
import { dateRibbonIndex, dateRibbonSelection, dateRibbonWindow, withRibbonDay, withoutRibbonDay } from '../src/events/dateRibbon';
import { shiftCalendarDay } from '../src/events/discoveryFilters';
import { getEventDateRange } from '../src/events/dateFilters';
import { defaultEventFilters } from '../src/events/constants';

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
