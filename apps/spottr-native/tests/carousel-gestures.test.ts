import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carouselCardAction, dismissCarouselDrag, verticalCarouselDrag } from '../../pulse-app/src/features/events/map/carouselGestures';
import { selectCalendarDay } from '../../pulse-app/src/features/events/discoveryFilters';

test('calendar uses two taps for both a range and a single day',()=>{
  const first=selectCalendarDay('','','2026-11-01',true);
  assert.deepEqual(first,{dateFrom:'2026-11-01',dateTo:''});
  assert.deepEqual(selectCalendarDay(first.dateFrom,first.dateTo,'2026-11-01',true),{dateFrom:'2026-11-01',dateTo:'2026-11-01'});
  assert.deepEqual(selectCalendarDay(first.dateFrom,first.dateTo,'2026-10-31',true),{dateFrom:'2026-10-31',dateTo:'2026-11-01'});
});
test('map cards select inactive neighbors and open only the active event',()=>{
  assert.equal(carouselCardAction('b','a'),'select');
  assert.equal(carouselCardAction('b','b'),'open');
  assert.equal(carouselCardAction('b',null),'select');
});
test('carousel dismiss gesture is deliberate downward movement, never horizontal browsing',()=>{
  assert.equal(verticalCarouselDrag(0,13),true);
  assert.equal(dismissCarouselDrag(0,47),false);
  assert.equal(dismissCarouselDrag(0,48),true);
  for(const [dx,dy] of [[80,60],[100,1],[20,-80],[0,0],[40,40]])assert.equal(dismissCarouselDrag(dx!,dy!),false);
});
