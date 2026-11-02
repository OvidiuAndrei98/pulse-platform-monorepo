import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutingsStore, canCreatePlan, canOfferTransfer, eventNightTickets, parsePlans, parseTransfers, planVoteCount, planningToday, validPlanningDate, matchesPlanningContext, type OutingPlan, type OutingsRequest } from '../src/outings/model';
import { translate } from '../src/i18n/translate';
import { resources } from '../src/i18n/resources';
import { wardrobeText,itemsText,depositedSince } from '../src/wardrobe/model';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};};
const plan:OutingPlan={id:id(1),ownerId:id(2),title:'Our night',status:'accepted',expiresAt:'2099-01-01T00:00:00Z',members:[{userId:id(2),username:'A',status:'accepted',voteEventId:id(4)},{userId:id(3),username:'B',status:'pending',voteEventId:id(4)}],options:[{eventId:id(4),title:'Event',location:'Venue',startTime:'2099-01-01T00:00:00Z',available:true}]};
test('plans start with a date, city and friends without requiring event choices',()=>{
  const day=planningToday();
  assert.equal(canCreatePlan('Our night',day,'Bucuresti',[id(3)]),true);
  for(const friends of [[],[id(1),id(1)],Array.from({length:8},(_,i)=>id(i+1))])assert.equal(canCreatePlan('Night',day,'Bucuresti',friends),false);
  assert.equal(canCreatePlan('Night','2026-02-30','Bucuresti',[id(3)]),false);
  assert.equal(canCreatePlan('Night',day,'Untrusted',[id(3)]),false);
  assert.equal(planVoteCount(plan,id(4)),1);
});
test('planning uses Romania calendar days and rejects past or beyond one-year dates',()=>{
  const now=new Date('2026-11-02T22:30:00Z');
  assert.equal(validPlanningDate('2026-11-03',now),true);
  assert.equal(validPlanningDate('2026-11-02',now),false);
  assert.equal(validPlanningDate('2027-11-04',now),false);
  const event={id:id(4),title:'Night',startTime:'2026-11-02T22:30:00Z',endTime:'2026-11-03T05:00:00Z',locationName:'Venue',city:'Bucuresti'};
  assert.equal(matchesPlanningContext(event,{outingDate:'2026-11-03',city:'Bucuresti'}),true);
  assert.equal(matchesPlanningContext(event,{outingDate:'2026-11-02',city:'Bucuresti'}),false);
  assert.equal(matchesPlanningContext(event,{outingDate:'2026-11-03',city:'Iasi'}),false);
});
test('transfer presentation excludes used, started, ended and malformed tickets',()=>{
  const base={isValidated:false,startTime:'2099-01-01T00:00:00Z',endTime:'2099-01-02T00:00:00Z'};
  assert.equal(canOfferTransfer(base,0),true);assert.equal(canOfferTransfer({...base,isValidated:true},0),false);
  assert.equal(canOfferTransfer({...base,startTime:'bad'},0),false);assert.equal(canOfferTransfer(base,Date.parse(base.startTime)),false);
  assert.equal(eventNightTickets([{eventId:id(1),endTime:base.endTime},{eventId:id(2),endTime:base.endTime}],id(1),0).length,1);
});
test('private API contracts reject invalid permissions/identities instead of guessing',()=>{
  assert.equal(parsePlans([plan]).length,1);
  assert.throws(()=>parsePlans([{...plan,status:'administrator'}]));
  assert.throws(()=>parsePlans([{...plan,options:[{eventId:id(4)}]}]));
  assert.throws(()=>parseTransfers([{id:id(1)}]));assert.throws(()=>parseTransfers(null));
});
test('mutations acquire synchronously and uncertain retries retain the same request key',async()=>{
  const write=deferred<unknown>();let calls=0;
  const request:OutingsRequest=async<T>(_path,method)=>{if(method==='POST'){calls++;return await write.promise as T;}return [] as T;};
  const store=new OutingsStore(request,()=>true,()=>id(9));
  assert.equal(store.requestId('transfer',{ticket:id(1)}),store.requestId('transfer',{ticket:id(1)}));
  const first=store.mutate('/outings/transfers',{}),second=await store.mutate('/outings/transfers',{});assert.equal(second,undefined);assert.equal(calls,1);
  write.resolve({ok:true});assert.deepEqual(await first,{ok:true});assert.equal(store.getSnapshot().working,false);
});
test('logout and teardown discard late reads/writes without publishing into a new account',async()=>{
  const response=deferred<unknown>();let active=true;
  const request:OutingsRequest=async<T>()=>await response.promise as T;
  const store=new OutingsStore(request,()=>active,()=>id(9));let publications=0;store.subscribe(()=>publications++);
  const pending=store.mutate('/outings/plans',{});active=false;store.dispose();const before=publications;response.resolve({id:id(1)});
  assert.equal(await pending,undefined);assert.equal(publications,before);
});
test('a completed mutation wins over an older read even when transport ignores abort',async()=>{
  const oldRead=deferred<unknown>();let first=true;
  const request:OutingsRequest=async<T>(path,method)=>{
    if(method==='POST')return {ok:true} as T;
    if(first&&path.endsWith('/plans')){first=false;return await oldRead.promise as T;}
    return (path.endsWith('/plans')?[plan]:[]) as T;
  };
  const store=new OutingsStore(request,()=>true,()=>id(9));const load=store.load();
  await store.mutate('/outings/plans',{});oldRead.resolve([]);await load;
  assert.equal(store.getSnapshot().plans[0]?.id,plan.id);
});
test('Strict Mode setup-cleanup-setup can load again and keeps request ownership',async()=>{
  const request:OutingsRequest=async<T>()=>[] as T;
  const store=new OutingsStore(request,()=>true,()=>id(9));store.activate();store.dispose();store.activate();await store.load();
  assert.equal(store.getSnapshot().pending,false);
});
test('transfer and planning screens load independent account-scoped inboxes',async()=>{
  for(const scope of ['plans','transfers'] as const){
    const paths:string[]=[];
    const request:OutingsRequest=async<T>(path)=>{paths.push(path);return [] as T;};
    const store=new OutingsStore(request,()=>true,()=>id(9),scope);
    await store.load();assert.deepEqual(paths,['/outings/'+scope]);
    assert.equal(store.getSnapshot().pending,false);
  }
});
test('wardrobe wording and plural/elapsed adapters use the shared i18n dictionaries',()=>{
  for(const language of ['ro','en'] as const){const ro=language==='ro',c=wardrobeText(ro);assert.equal(c.title,resources[language].translation.wardrobe.title);assert.equal(c.flow.receive,translate(language,'wardrobe.flow.receive'));assert.equal(c.unclaimedSummary(2,3),translate(language,'wardrobe.deposits',{count:2})+' · '+translate(language,'wardrobe.unclaimedItems',{count:3}));assert.equal(itemsText({coat:1,bag:2,backpack:0},ro),'1 '+translate(language,'wardrobe.items.coat',{count:1})+' · 2 '+translate(language,'wardrobe.items.bag',{count:2}));assert.equal(depositedSince({createdAt:'2026-01-01T00:00:00Z'},ro,Date.parse('2026-01-01T00:00:00Z')),translate(language,'wardrobe.elapsed.now'));}
});
