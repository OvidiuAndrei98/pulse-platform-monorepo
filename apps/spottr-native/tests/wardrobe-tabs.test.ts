import test from 'node:test';
import assert from 'node:assert/strict';
import { tabFocusIndex } from '../../pulse-app/src/features/wardrobe/tabNavigation';
import { wardrobeTasks,wardrobeTabLabel,wardrobeEventPhase } from '../../pulse-app/src/features/wardrobe/flow';
test('tab keyboard navigation wraps, skips disabled tabs and supports Home/End',()=>{
  const disabled=[false,true,false,false];
  assert.equal(tabFocusIndex('ArrowRight',0,disabled),2);assert.equal(tabFocusIndex('ArrowLeft',0,disabled),3);
  assert.equal(tabFocusIndex('Home',3,disabled),0);assert.equal(tabFocusIndex('End',0,disabled),3);
  assert.equal(tabFocusIndex('ArrowRight',3,disabled),0);assert.equal(tabFocusIndex('Enter',0,disabled),-1);
  assert.equal(tabFocusIndex('ArrowRight',0,[true,true]),-1);assert.equal(tabFocusIndex('ArrowRight',1,disabled),0);
});
test('reservation-locked tabs keep focus on the current operation and RTL arrows mirror',()=>{
  assert.equal(tabFocusIndex('ArrowRight',0,[false,true,true]),0);
  assert.equal(tabFocusIndex('End',0,[false,true,true]),0);
  assert.equal(tabFocusIndex('ArrowRight',0,[false,false,false],true),2);
});
test('operator tabs prioritize custody tasks and only managers see setup',()=>{
  assert.deepEqual(wardrobeTasks(true),['receive','pickup','unclaimed','history','setup']);
  assert.deepEqual(wardrobeTasks(false),['receive','pickup','unclaimed','history']);
  assert.deepEqual(wardrobeTasks(true).map(task=>wardrobeTabLabel(task,true)),['Primire','Predare','Neridicate','Activitate','Configurare']);
});
test('active events exclude ended/draft/cancelled records without removing access to their custody history',()=>{
  const now=Date.parse('2026-10-30T12:00:00Z'),event={id:'a',title:'Event',canManage:true,status:'published',startTime:'2026-10-30T10:00:00Z',endTime:'2026-10-30T14:00:00Z'};
  assert.equal(wardrobeEventPhase(event,now),'live');assert.equal(wardrobeEventPhase({...event,startTime:'2026-10-31T10:00:00Z'},now),'upcoming');
  for(const patch of [{endTime:'2026-10-30T12:00:00Z'},{status:'draft'},{status:'cancelled'},{status:'completed'}])assert.equal(wardrobeEventPhase({...event,...patch},now),'other');
  assert.equal(wardrobeEventPhase({id:'legacy',title:'Event',canManage:true},now),'active');
});
