import test from 'node:test';
import assert from 'node:assert/strict';
import { OutingsStore, eventPlanningContext, eventPlanDraft, matchingOutingPlans, parsePlanSourceEvent, type OutingsRequest, type OutingPlan } from '../src/outings/model';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const now=new Date('2026-11-03T12:00:00Z');
const event={id:id(1),title:'After dark',city:'Bucuresti',locationName:'Venue',startTime:'2026-11-03T22:30:00Z',endTime:'2026-11-04T05:00:00Z',status:'published'};
const live=()=>({...event,startTime:new Date(Date.now()+86400000).toISOString(),endTime:new Date(Date.now()+90000000).toISOString()});
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
test('an event seeds its Romania calendar day and canonical city, including the DST boundary',()=>{
  assert.deepEqual(eventPlanningContext({...event,city:'  bucuresti '},now),{outingDate:'2026-11-04',city:'Bucuresti'});
  assert.deepEqual(eventPlanningContext({...event,startTime:'2026-10-24T21:30:00Z',endTime:'2026-10-25T04:00:00Z'},new Date('2026-10-24T10:00:00Z')),{outingDate:'2026-10-25',city:'Bucuresti'});
  for(const value of [{...event,endTime:now.toISOString()},{...event,startTime:'bad'},{...event,city:'Untrusted'},{...event,startTime:'2028-01-01T00:00:00Z',endTime:'2028-01-02T00:00:00Z'}])assert.equal(eventPlanningContext(value,now),undefined);
});
test('source response retains only public planning fields and rejects draft or incomplete responses',()=>{
  assert.deepEqual(parsePlanSourceEvent({...event,email:'secret@example.invalid',validationHash:'secret'}),{id:event.id,title:event.title,city:event.city,locationName:event.locationName,startTime:event.startTime,endTime:event.endTime});
  for(const value of [{...event,status:'draft'},{...event,id:'broken'},{...event,city:undefined},{...event,startTime:'bad'}])assert.throws(()=>parsePlanSourceEvent(value));
});
test('event creation is one explicit draft with one proposal and no automatic destination or vote',()=>{
  const draft=eventPlanDraft(event,'  Our night  ',[id(2)],now);
  assert.deepEqual(draft,{title:'Our night',outingDate:'2026-11-04',city:'Bucuresti',friendIds:[id(2)],eventIds:[id(1)]});
  for(const people of [[],[id(2),id(2)],Array.from({length:8},(_,i)=>id(i+2))])assert.equal(eventPlanDraft(event,'Our night',people,now),undefined);
  assert.equal(eventPlanDraft({...event,endTime:now.toISOString()},'Night',[id(2)],now),undefined);
});
test('existing outings must be accepted, undecided and context-compatible; already-added events can be opened',()=>{
  const plan:OutingPlan={id:id(3),ownerId:id(2),title:'Plan',status:'accepted',outingDate:'2026-11-04',city:'Bucuresti',expiresAt:'2026-11-05T23:59:59Z',members:[],options:[]};
  const full={...plan,id:id(4),options:Array.from({length:8},(_,n)=>({eventId:id(n+20),title:'Other event',location:'Venue',startTime:event.startTime,available:true}))};
  const duplicate={...full,id:id(5),options:[{...full.options[0],eventId:event.id},...full.options.slice(1)]};
  const rows=matchingOutingPlans([plan,full,duplicate,{...plan,id:id(6),status:'pending'},{...plan,id:id(7),chosenEventId:id(20)},{...plan,id:id(8),city:'Iasi'},{...plan,id:id(9),outingDate:'2026-11-03'}],event);
  assert.deepEqual(rows.map(row=>row.id),[plan.id,duplicate.id]);
});
test('loading source context and friends cannot create a plan or fetch an unused event catalog',async()=>{
  const calls:{path:string;method:string;body:unknown}[]=[],source=live();
  const request:OutingsRequest=async<T>(path,method,body)=>{calls.push({path,method,body});return (path.startsWith('/events/')?source:path==='/friends'?[{id:id(2),username:'Friend'}]:[]) as T;};
  const store=new OutingsStore(request,()=>true,()=>id(9),'plans');
  await Promise.all([store.load(),store.loadSourceEvent(event.id),store.loadFriends()]);
  assert.ok(calls.every(call=>call.method==='GET'));assert.ok(!calls.some(call=>call.path.startsWith('/events?')));
  assert.equal(store.getSnapshot().sourceEvent?.id,event.id);assert.equal(store.getSnapshot().friends[0]?.id,id(2));
  await store.createPlan(eventPlanDraft(source,'Our night',[id(2)])!);
  const writes=calls.filter(call=>call.method==='POST');assert.equal(writes.length,1);
  assert.deepEqual(writes[0].body,{...eventPlanDraft(source,'Our night',[id(2)]),requestId:id(9)});
});
test('switching events aborts the old source and ignores its late response',async()=>{
  const first=deferred<unknown>();let signal:AbortSignal|undefined;
  const request:OutingsRequest=async<T>(path,_method,_body,abort)=>{if(path.endsWith(id(1))){signal=abort;return await first.promise as T;}return {...live(),id:id(2)} as T;};
  const store=new OutingsStore(request,()=>true,()=>id(9));const old=store.loadSourceEvent(id(1));await store.loadSourceEvent(id(2));
  assert.equal(signal?.aborted,true);first.resolve(live());await old;assert.equal(store.getSnapshot().sourceEvent?.id,id(2));
});
test('source load failures retry without writes, while unavailable or mismatched events cannot seed a plan',async()=>{
  let fail=true;const request:OutingsRequest=async<T>()=>{if(fail)throw Error('offline');return live() as T;};
  const store=new OutingsStore(request,()=>true,()=>id(9));await store.loadSourceEvent(id(1));assert.equal(store.getSnapshot().sourceError,'outings.eventStart.loadFailed');
  fail=false;await store.loadSourceEvent(id(1));assert.equal(store.getSnapshot().sourceError,null);
  const wrong=new OutingsStore(async<T>()=>({...live(),id:id(2)}) as T,()=>true,()=>id(9));await wrong.loadSourceEvent(id(1));assert.equal(wrong.getSnapshot().sourceEvent,null);assert.equal(wrong.getSnapshot().sourceError,'outings.eventStart.unavailable');
});
test('logout aborts source reads and cannot repopulate private state in another account',async()=>{
  const read=deferred<unknown>();let current=true;const request:OutingsRequest=async<T>()=>await read.promise as T;
  const store=new OutingsStore(request,()=>current,()=>id(9));const work=store.loadSourceEvent(id(1));current=false;store.dispose();read.resolve(live());await work;
  assert.equal(store.getSnapshot().sourceEvent,null);
});
test('friend loading has its own deliberate retry without clearing the event or failing the outing inbox',async()=>{
  let fail=true;const request:OutingsRequest=async<T>(path)=>{if(path==='/friends'){if(fail)throw Error('offline');return [{id:id(2),username:'Friend'}] as T;}return live() as T;};
  const store=new OutingsStore(request,()=>true,()=>id(9));await store.loadSourceEvent(id(1));await store.loadFriends();
  assert.equal(store.getSnapshot().friendsError,'outings.failed');assert.equal(store.getSnapshot().error,null);assert.equal(store.getSnapshot().sourceEvent?.id,id(1));
  fail=false;await store.loadFriends();assert.equal(store.getSnapshot().friendsError,null);assert.equal(store.getSnapshot().friends.length,1);
});
