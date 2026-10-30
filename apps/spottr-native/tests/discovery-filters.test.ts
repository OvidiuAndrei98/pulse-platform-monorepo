import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeDiscoveryStart, calendarCells, eventMatchesSearch, eventWithinDistance, normalizeDiscoverySearch, productMidnight, productToday, selectCalendarDay, validCalendarDay } from '../../pulse-app/src/features/events/discoveryFilters';
import { getEventDateRange } from '../../pulse-app/src/features/events/dateFilters';

test('Romanian calendar days include the last selected day across DST and year boundaries',()=>{
  for(const [day,hours] of [['2026-03-29',23],['2026-10-25',25],['2026-12-31',24]] as const){
    const range=getEventDateRange('Custom',{dateFrom:day,dateTo:day});
    assert.equal((Date.parse(range.startsBefore!)-Date.parse(range.startsAfter!))/3_600_000,hours);
    assert.equal(productToday(new Date(range.startsAfter!)),day);
    assert.equal(productToday(new Date(Date.parse(range.startsBefore!)-1)),day);
  }
  assert.equal(productMidnight('2026-03-29'),'2026-03-28T22:00:00.000Z');
  assert.equal(productMidnight('2026-03-30'),'2026-03-29T21:00:00.000Z');
  assert.equal(productToday(new Date('2026-10-30T23:00:00Z')),'2026-10-31');
});
test('calendar range selection is ordered, complete for single days, and rejects invalid input',()=>{
  assert.deepEqual(selectCalendarDay('','','2026-12-31',false),{dateFrom:'2026-12-31',dateTo:'2026-12-31'});
  assert.deepEqual(selectCalendarDay('2027-01-02','','2026-12-31',true),{dateFrom:'2026-12-31',dateTo:'2027-01-02'});
  assert.deepEqual(selectCalendarDay('2026-12-31','2027-01-02','2027-01-10',true),{dateFrom:'2027-01-10',dateTo:''});
  for(const day of ['2026-02-29','2026-04-31','2026-1-01','bad','2101-01-01'])assert.equal(validCalendarDay(day),false);
  assert.equal(validCalendarDay('2028-02-29'),true);
  assert.deepEqual(getEventDateRange('Custom',{dateFrom:'2026-12-31',dateTo:'2026-12-30'}),{});
  assert.deepEqual(getEventDateRange('Custom',{dateFrom:'2026-12-31',dateTo:''}),{});
  assert.equal(getEventDateRange('Custom',{dateFrom:'2100-12-31',dateTo:'2100-12-31'}).startsBefore,'2100-12-31T22:00:00.000Z');
  const cells=calendarCells('2026-11-01');assert.equal(cells.length,42);assert.equal(cells[0],'2026-10-26');
});
test('discovery starts no earlier than now while retaining ongoing events and future ranges',()=>{
  const now='2026-10-30T12:00:00.000Z',start=activeDiscoveryStart(productMidnight('2026-10-30'),now);
  assert.equal(start,now);assert.equal(activeDiscoveryStart(undefined,now),now);
  assert.equal(Date.parse('2026-10-30T11:59:00Z')>Date.parse(start),false);
  assert.equal(Date.parse('2026-10-31T02:00:00Z')>Date.parse(start),true);
  for(const day of ['2026-10-31','2027-03-28','2027-10-31'])assert.equal(activeDiscoveryStart(productMidnight(day),now),productMidnight(day));
});
test('search is literal, normalized, Unicode bounded and excludes nonmatching promotions',()=>{
  assert.equal(normalizeDiscoverySearch('  House   party\n '),'House party');
  assert.equal(Array.from(normalizeDiscoverySearch('😀'.repeat(121))).length,120);
  const event={id:'123',title:'Rooftop Party',locationName:'QA Club',city:'Bucuresti',category:'HOUSE'};
  assert.equal(eventMatchesSearch(event,'rooftop'),true);assert.equal(eventMatchesSearch(event,'qa club'),true);
  assert.equal(eventMatchesSearch(event,'house'),true);assert.equal(eventMatchesSearch(event,'other'),false);
  assert.equal(eventMatchesSearch(event,'%'),false);assert.equal(eventMatchesSearch(event,'_'),false);
});
test('distance filters use an explicit center and reject missing or invalid event coordinates',()=>{
  const center=[44.4268,26.1025] as const;
  assert.equal(eventWithinDistance({latitude:44.4268,longitude:26.1025},center,1),true);
  assert.equal(eventWithinDistance({latitude:44.4723,longitude:26.1663},center,1),false);
  assert.equal(eventWithinDistance({latitude:44.4723,longitude:26.1663},center,15),true);
  assert.equal(eventWithinDistance({},center,15),false);assert.equal(eventWithinDistance({latitude:91,longitude:0},center,15),false);
  assert.equal(eventWithinDistance({},null,15),true);
});
