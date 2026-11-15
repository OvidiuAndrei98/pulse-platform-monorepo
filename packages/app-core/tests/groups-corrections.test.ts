import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {GroupsStore,findMatchingFriendGroup,groupCatalogKey,groupMembershipCounts,type FriendGroup} from '../src/social/groups';
import {canonicalPlanningCity,matchesPlanningContext,planningBoundary,planningCityKey,type OutingsRequest,type OutingPlan,type PlanEvent} from '../src/outings/model';
import {shiftCalendarDay} from '../src/events/discoveryFilters';

const id=(n:number)=>`22222222-2222-4222-8222-${String(n).padStart(12,'0')}`;
const event=(n:number,start='2026-11-26T18:00:00Z',city='Bucuresti'):PlanEvent=>({id:id(n),title:'Review event '+n,city,startTime:start,endTime:'2027-01-01T05:00:00Z',locationName:'Review venue'});
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}};
const setup=(handler:(path:string,method:string,body:any)=>Promise<any>)=>{let serial=9000;return new GroupsStore(handler as OutingsRequest,()=>true,()=>id(serial++))};
const context={date:'2026-11-26',city:'Bucuresti'};

test('planning city identities use canonical IDs across Romanian display diacritics and case',()=>{
 for(const [label,canonical] of [['București','Bucuresti'],['Bucureşti','Bucuresti'],['Iași','Iasi'],['Timișoara','Timisoara'],['Brașov','Brasov'],['Constanța','Constanta']] as const){
  assert.equal(canonicalPlanningCity('  '+label.toUpperCase()+'  '),canonical);
  assert.equal(planningCityKey(label),planningCityKey(canonical));
 }
 assert.ok(matchesPlanningContext(event(1,undefined,'București'),{outingDate:context.date,city:'Bucuresti'}));
 assert.ok(matchesPlanningContext(event(1),{outingDate:context.date,city:'BUCUREȘTI'}));
 assert.equal(matchesPlanningContext(event(1,undefined,'Cluj-Napoca'),{outingDate:context.date,city:'Bucuresti'}),false);
});

test('the selected nightlife date uses start-time eligibility with a single 06:00 boundary',()=>{
 const plan={outingDate:'2026-11-19',city:'Bucuresti'};
 const cases:[string,boolean][]=[['2026-11-19T03:59:00Z',false],['2026-11-19T04:00:00Z',true],['2026-11-19T21:00:00Z',true],['2026-11-19T23:00:00Z',true],['2026-11-20T03:59:00Z',true],['2026-11-20T04:00:00Z',false],['2026-11-20T20:00:00Z',false]];
 for(const [start,eligible] of cases)assert.equal(matchesPlanningContext(event(1,start),plan),eligible,start);
 assert.equal(matchesPlanningContext(event(1,'2026-11-08T18:00:00Z'),plan),false,'a long overlapping event is not a new occurrence');
 assert.ok(matchesPlanningContext(event(1,'2026-12-31T23:15:00Z'),{...plan,outingDate:'2026-12-31'}));
});

test('calendar-night bounds preserve DST and cross-year dates instead of adding fixed 24 hours',()=>{
 assert.equal(planningBoundary('2026-11-19'),'2026-11-19T04:00:00.000Z');
 assert.equal(planningBoundary('2026-11-20'),'2026-11-20T04:00:00.000Z');
 for(const [night,hours] of [['2026-03-28',23],['2026-10-24',25]] as const){
  const duration=Date.parse(planningBoundary(shiftCalendarDay(night,1)))-Date.parse(planningBoundary(night));
  assert.equal(duration,hours*60*60*1000);
 }
 assert.equal(shiftCalendarDay('2026-12-31',1),'2027-01-01');
});

test('blank search requests the selected canonical night rather than requiring typing',async()=>{
 const paths:string[]=[];
 const store=setup(async path=>{paths.push(path);return path==='/friends'?[]:[event(1)]});
 await store.catalog('',{date:context.date,city:'București'});
 const request=paths.find(path=>path.startsWith('/events?'));assert.ok(request);
 const params=new URL('https://review.invalid'+request).searchParams;
 assert.equal(params.get('q'),'');assert.equal(params.get('page'),'1');
 assert.equal(params.get('city'),'Bucuresti');assert.equal(params.get('nightDate'),context.date);
 assert.equal(params.has('startsAfter'),false);assert.equal(params.has('startsBefore'),false);
 assert.equal(store.getSnapshot().events[0]?.id,id(1));assert.equal(store.getSnapshot().catalogStatus,'success');
});

test('a failed friend directory does not hide an independently successful event catalog',async()=>{
 const store=setup(async path=>{if(path==='/friends')throw {status:503};return[event(1)]});
 await store.loadFriends();assert.ok(store.getSnapshot().friendsError);
 await store.catalog('',context);
 assert.equal(store.getSnapshot().catalogStatus,'success');
 assert.equal(store.getSnapshot().catalogError,null);assert.deepEqual(store.getSnapshot().events.map(row=>row.id),[id(1)]);
});

test('a focused group poll cannot erase a selector error and relabel it as empty results',async()=>{
 const store=setup(async path=>{if(path==='/friends'||path==='/outings/groups')return[];throw {status:503}});
 await store.catalog('',context);const failed=store.getSnapshot().catalogError;
 assert.ok(failed);assert.equal(store.getSnapshot().catalogStatus,'error');
 await store.load();assert.equal(store.getSnapshot().catalogError,failed);assert.equal(store.getSnapshot().catalogStatus,'error');
});

test('changing night or city removes old-context results immediately while the next result loads',async()=>{
 const next=deferred<PlanEvent[]>();let phase=0;
 const store=setup(async path=>path==='/friends'?[]:phase?next.promise:[event(1)]);
 await store.catalog('',context);phase=1;
 const changed={date:'2026-11-20',city:'Cluj-Napoca'},pending=store.catalog('',changed);
 assert.equal(store.getSnapshot().catalogKey,groupCatalogKey('',changed));
 assert.equal(store.getSnapshot().catalogStatus,'loading');assert.deepEqual(store.getSnapshot().events,[]);
 next.resolve([event(2,'2026-11-20T20:00:00Z','Cluj-Napoca')]);await pending;
 assert.equal(store.getSnapshot().events[0]?.id,id(2));assert.equal(store.getSnapshot().catalogStatus,'success');
});

test('a delayed failed catalog cannot overwrite the new context or its success state',async()=>{
 const old=deferred<PlanEvent[]>();
 const store=setup(async path=>path==='/friends'?[]:path.includes('q=old')?old.promise:[event(2)]);
 const pending=store.catalog('old',context);await store.catalog('new',context);
 old.reject({status:503});await pending;
 assert.equal(store.getSnapshot().catalogKey,groupCatalogKey('new',context));
 assert.equal(store.getSnapshot().catalogStatus,'success');assert.equal(store.getSnapshot().catalogError,null);
 assert.equal(store.getSnapshot().events[0]?.id,id(2));
});

test('a legitimate empty success is distinct from a catalog failure and retry preserves filters',async()=>{
 let fail=true;const paths:string[]=[];
 const store=setup(async path=>{if(path==='/friends')return[];paths.push(path);if(fail)throw{status:422};return[]});
 await store.catalog('rooftop',context);assert.equal(store.getSnapshot().catalogStatus,'error');assert.ok(store.getSnapshot().catalogError);
 fail=false;await store.catalog('rooftop',context);
 assert.equal(paths[0],paths[1]);assert.equal(store.getSnapshot().catalogStatus,'success');assert.equal(store.getSnapshot().catalogError,null);assert.deepEqual(store.getSnapshot().events,[]);
});

const actor=id(2),gid=id(3);
const group=(outings:OutingPlan[]=[]):FriendGroup=>({id:gid,name:'Review group',ownerId:actor,status:'accepted',revision:1,lastSeq:0,unread:0,muted:false,visibleAfterSeq:0,joinedAt:'2026-11-01T00:00:00Z',members:[{userId:actor,username:'Review owner',status:'accepted'},{userId:id(4),username:'Review friend',status:'pending'}],outings,outingsHasMore:false});

test('existing-group matching counts pending invitations without accepting them or matching extra people',()=>{
 const original=group();
 assert.equal(findMatchingFriendGroup([original],actor,[id(4)])?.id,gid);
 assert.deepEqual(groupMembershipCounts(original),{accepted:1,pending:1});
 assert.equal(original.members[1]!.status,'pending');
 assert.equal(findMatchingFriendGroup([{...original,status:'pending'}],actor,[id(4)]),undefined);
 assert.equal(findMatchingFriendGroup([{...original,members:original.members.map(m=>m.userId===actor?{...m,status:'pending' as const}:m)}],actor,[id(4)]),undefined);
 assert.equal(findMatchingFriendGroup([{...original,members:[...original.members,{userId:id(5),username:'Extra person',status:'accepted'}]}],actor,[id(4)]),undefined);
 assert.equal(findMatchingFriendGroup([original],actor,[id(5)]),undefined,'display names never replace account IDs');
 assert.equal(findMatchingFriendGroup([original],actor,[id(4),id(4)]),undefined);
 assert.equal(findMatchingFriendGroup([original],actor,[actor]),undefined);
});

test('matching the same canonical UUID does not depend on hexadecimal letter case',()=>{
 const friend='abcdefab-cdef-4abc-8def-000000000004',original={...group(),members:[group().members[0]!,{userId:friend,username:'Review friend',status:'pending' as const}]};
 assert.equal(findMatchingFriendGroup([original],actor,[friend.toUpperCase()])?.id,gid);
 assert.equal(findMatchingFriendGroup([original],actor,[friend,friend.toUpperCase()]),undefined,'duplicates must be detected after ID normalization');
});

test('lost-ack group creation retries retain a key, but an acknowledged identical new creation gets a new key',async()=>{
 const keys:string[]=[];let lostAck=true;
 const store=setup(async(path,method,body)=>{if(method==='POST'){keys.push(body.requestId);if(lostAck){lostAck=false;throw Error('lost acknowledgement')}return group()}return[]});
 assert.equal(await store.create('Review group',[id(4)]),undefined);
 assert.ok(await store.create('Review group',[id(4)]));
 assert.equal(keys[0],keys[1]);
 assert.ok(await store.create('Review group',[id(4)]));
 assert.notEqual(keys[1],keys[2]);
});

test('a late old-context plan response cannot replace the snapshot returned after editing the outing',async()=>{
 const planId=id(30),oldPlan=deferred<OutingPlan>();let changed=false;
 const plan=():OutingPlan=>({id:planId,groupId:gid,ownerId:actor,title:'Review night',status:'accepted',expiresAt:'2027-01-01T00:00:00Z',outingDate:changed?'2026-11-20':'2026-11-19',city:changed?'Cluj-Napoca':'Bucuresti',revision:changed?2:1,members:[],options:[]});
 const before=plan();
 const store=setup(async(path,method)=>{if(method==='POST'){changed=true;return{ok:true}}if(path==='/outings/plans/'+planId)return oldPlan.promise;if(path.endsWith('/messages'))return{items:[],hasMore:false};return group([plan()])});
 await store.load(gid);const pending=store.loadPlan(gid,planId);
 assert.ok(await store.planAction(gid,planId,'context',{revision:1,date:'2026-11-20',city:'Cluj-Napoca'}));
 oldPlan.resolve(before);await pending;
 const current=store.getSnapshot().groups[0]!.outings[0]!;
 assert.equal(current.outingDate,'2026-11-20');assert.equal(current.city,'Cluj-Napoca');assert.equal(current.revision,2);
});

test('a separate acknowledged group action cannot strand an authorized catalog in loading state',async()=>{
 const result=deferred<PlanEvent[]>();
 const store=setup(async(path,method)=>{if(path.startsWith('/events?'))return result.promise;if(method==='POST')return{ok:true};if(path.endsWith('/messages'))return{items:[],hasMore:false};return group()});
 await store.load(gid);const pending=store.catalog('',context);
 assert.ok(await store.action(gid,{action:'mute',muted:true}));
 result.resolve([event(1)]);await pending;
 assert.equal(store.getSnapshot().catalogStatus,'success');assert.equal(store.getSnapshot().catalogLoading,false);assert.equal(store.getSnapshot().events[0]?.id,id(1));
});

test('choosing a night carries the current outing revision so an old context cannot be confirmed silently',async()=>{
 const planId=id(30),plan:OutingPlan={id:planId,groupId:gid,ownerId:actor,title:'Review nights',status:'accepted',expiresAt:'2027-01-01T00:00:00Z',city:'Bucuresti',revision:7,members:[],options:[]};let sent:any;
 const store=setup(async(path,method,body)=>{if(method==='POST'){sent=body;return{ok:true}}if(path.endsWith('/messages'))return{items:[],hasMore:false};return group([plan])});
 await store.load(gid);await store.planAction(gid,planId,'date',{date:'2026-11-20'});
 assert.equal(sent.revision,7);assert.equal(sent.date,'2026-11-20');
});
