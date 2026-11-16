import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {GroupsStore,groupReadinessLabel,groupTicketReadiness,parseGroups,parseMessages,type FriendGroup} from '../src/social/groups';
import type {OutingsRequest,OutingPlan} from '../src/outings/model';
const id=(n:number)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const gid=id(1),actor=id(2);
const group=(patch:Partial<FriendGroup>={}):FriendGroup=>({id:gid,name:'Group QA',ownerId:actor,status:'accepted',revision:1,lastSeq:0,unread:0,muted:false,visibleAfterSeq:0,joinedAt:'2026-11-01T00:00:00Z',members:[{userId:actor,username:'Member QA',status:'accepted'}],preview:'',outings:[],outingsHasMore:false,...patch});
const message=(seq:number)=>({id:id(1000+seq),requestId:id(2000+seq),seq,senderId:actor,username:'Member QA',kind:'text',content:'QA '+seq,createdAt:'2026-11-14T20:00:00Z'});
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{resolve,promise}};
function setup(handler:(path:string,method:string,body:any)=>Promise<any>){let current=true,key=9000;const store=new GroupsStore(handler as OutingsRequest,()=>current,()=>id(key++));return {store,end:()=>{current=false;store.dispose()}}}
test('pending invitation payloads cannot include conversation previews or outings',()=>{
 assert.equal(parseGroups([group({status:'pending',joinedAt:undefined})])[0]!.status,'pending');
 assert.throws(()=>parseGroups([group({status:'pending',preview:'private'})]));
 assert.throws(()=>parseGroups([group({members:Array.from({length:9},()=>({userId:actor,username:'QA',status:'accepted'}))})]));
 assert.throws(()=>parseMessages({items:[{...message(1),requestId:'invalid'}],hasMore:false}));
});
test('pending invite never fetches messages; joining does not manufacture attendance or an outing',async()=>{
 const calls:string[]=[];const {store}=setup(async(path,method)=>{calls.push(method+' '+path);return path==='/outings/groups'?[group({status:'pending',joinedAt:undefined})]:{}});
 await store.load();assert.equal(store.getSnapshot().groups[0]!.outings.length,0);assert.deepEqual(calls,['GET /outings/groups']);
});
test('message retry keeps a stable client ID until acknowledgement, then permits an intentional repeat',async()=>{
 const writes:any[]=[];let fail=true,seq=0;const {store}=setup(async(path,method,body)=>{if(method==='POST'){writes.push(clone(body));if(fail){fail=false;throw Error('network')};seq++;return{ok:true}}if(path.endsWith('/messages'))return{items:seq?[message(seq)]:[],hasMore:false,revision:1};return group({lastSeq:seq})});
 await store.load(gid);store.draft(gid,'Hello');await store.send(gid);assert.equal(store.getSnapshot().drafts[gid],'Hello');assert.equal(store.getSnapshot().sendError,'groups.messageFailed');
 await store.send(gid);assert.equal(writes[0].requestId,writes[1].requestId);assert.equal(store.getSnapshot().drafts[gid],'');
 store.draft(gid,'Hello');await store.send(gid);assert.notEqual(writes[2].requestId,writes[1].requestId);
});
test('sharing an event preserves an unrelated unsent draft',async()=>{
 let body:any;const {store}=setup(async(path,method,data)=>{if(method==='POST'){body=data;return{ok:true}}return path.endsWith('/messages')?{items:[],hasMore:false,revision:1}:group()});
 await store.load(gid);store.draft(gid,'Private unsent draft');await store.send(gid,id(40));assert.equal(body.content,'');assert.equal(body.eventId,id(40));assert.equal(store.getSnapshot().drafts[gid],'Private unsent draft');
});
test('revoked membership invalidates an older in-flight messages response',async()=>{
 let deny=false,wait=false;const old=deferred<any>();const {store}=setup(async(path)=>{if(path.endsWith('/messages'))return wait?old.promise:{items:[message(1)],hasMore:false,revision:1};if(deny)throw {status:404,code:'GROUP_ACCESS_LOST'};return group({lastSeq:1})});
 await store.load(gid);wait=true;const pending=store.loadMessages(gid);deny=true;await store.load(gid);assert.equal(store.getSnapshot().messages[gid],undefined);old.resolve({items:[message(2)],hasMore:false,revision:1});await pending;assert.equal(store.getSnapshot().messages[gid],undefined);assert.equal(store.getSnapshot().groups.length,0);
});
test('accepted→pending→reaccepted purges old private caches and lifts the local access-lost state',async()=>{
 let g=group({lastSeq:1});const {store}=setup(async(path)=>path.endsWith('/messages')?{items:[message(1),message(4)],hasMore:false,revision:1}:clone(g));
 await store.load(gid);store.draft(gid,'draft');g=group({status:'pending',joinedAt:undefined,preview:''});await store.load(gid);assert.equal(store.getSnapshot().messages[gid],undefined);assert.equal(store.getSnapshot().drafts[gid],undefined);
 g=group({visibleAfterSeq:3,joinedAt:'2026-11-14T10:00:00Z'});await store.load(gid);assert.deepEqual(store.getSnapshot().messages[gid]!.map(m=>m.seq),[4]);assert.equal(store.getSnapshot().revoked.includes(gid),false);
});
test('rejoin boundary also invalidates history when the removal was missed between polls',async()=>{
 let g=group({lastSeq:1});const {store}=setup(async(path)=>path.endsWith('/messages')?{items:[message(1),message(8)],hasMore:false,revision:1}:clone(g));await store.load(gid);
 g=group({visibleAfterSeq:7,joinedAt:'2026-11-14T12:00:00Z'});await store.load(gid);assert.deepEqual(store.getSnapshot().messages[gid]!.map(m=>m.seq),[8]);
});
test('disposal aborts requests and late results cannot restore account data',async()=>{
 const result=deferred<any>();const {store,end}=setup(()=>result.promise);const pending=store.load();end();result.resolve([group()]);await pending;assert.deepEqual(store.getSnapshot().groups,[]);
});
test('a large incoming batch leaves a fillable cursor gap rather than skipping private history',async()=>{
 let phase=0;const cursors:string[]=[];const page=(lo:number,hi:number)=>Array.from({length:hi-lo+1},(_,i)=>message(hi-i));
 const {store}=setup(async path=>{if(path.includes('/messages')){cursors.push(path);const before=new URL('https://test'+path).searchParams.get('before');if(before==='151')return{items:page(101,150),hasMore:true};if(before==='101')return{items:page(51,100),hasMore:true};return{items:phase? page(151,200):page(1,50),hasMore:!!phase}}return group({lastSeq:phase?200:50})});
 await store.load(gid);phase=1;await store.load(gid);await store.loadMessages(gid,true);await store.loadMessages(gid,true);
 assert.ok(cursors.some(p=>p.endsWith('before=151')));assert.ok(cursors.some(p=>p.endsWith('before=101')));assert.equal(store.getSnapshot().messages[gid]!.length,200);assert.equal(store.getSnapshot().more[gid],false);
});
test('the latest event search wins when earlier requests return out of order',async()=>{
 const old=deferred<any>();const event=(title:string)=>({id:id(50),title,startTime:'2026-12-01T22:00:00Z',endTime:'2026-12-02T04:00:00Z',city:'Bucuresti',locationName:'QA'});
 const {store}=setup(async(path)=>path==='/friends'?[]:path.includes('q=old')?old.promise:[event('Latest QA')]);const pending=store.catalog('old');await store.catalog('new');old.resolve([event('Old QA')]);await pending;assert.equal(store.getSnapshot().events[0]!.title,'Latest QA');
});

test('create and share sends the known public event atomically without manufacturing an outing',async()=>{
 const writes:{path:string;body:any}[]=[];const {store}=setup(async(path,method,body)=>{if(method==='POST'){writes.push({path,body});return group()}return []});
 const created=await store.create('Friday people',[id(3)],id(40));
 assert.equal(created?.outings.length,0);assert.equal(writes.length,1);assert.equal(writes[0]!.path,'/outings/groups');assert.equal(writes[0]!.body.eventId,id(40));assert.deepEqual(writes[0]!.body.friendIds,[id(3)]);
});

const outing=(n:number,patch:Partial<OutingPlan>={}):OutingPlan=>({id:id(n),groupId:gid,ownerId:actor,title:'Night QA',status:'accepted',expiresAt:'2027-01-01T00:00:00Z',createdAt:'2026-11-14T20:00:00Z',members:[],options:[],...patch});

test('one confirmed guest gets a personal ready label rather than a whole-group claim',()=>{
 const p=outing(30,{allConfirmedReady:true,confirmedCount:1,members:[{userId:actor,username:'QA',status:'accepted',attendance:'yes'}]});
 assert.equal(groupReadinessLabel(p,actor),'groups.readyForYou');assert.equal(groupReadinessLabel(p,id(3)),'groups.readyForOne');assert.equal(groupReadinessLabel({...p,allConfirmedReady:false,confirmedCount:0},actor),'groups.summary');
});

test('ticket readiness never describes unknown or unavailable admission as zero tickets',()=>{
 const yes={userId:actor,username:'QA',status:'accepted' as const,attendance:'yes' as const};
 const p=outing(30,{chosenEventId:id(40),lifecycle:'event_selected',members:[{...yes,ticketState:'valid',hasTicket:true},{...yes,userId:id(3),ticketState:'unknown'}]});
 const partial=groupTicketReadiness(p,actor);
 assert.equal(partial.ready,1);assert.equal(partial.unknown,1);assert.equal(partial.complete,false);assert.equal(partial.summaryKey,'groups.readinessPartial');assert.equal(partial.allConfirmedReady,false);assert.equal(partial.ownTicketUsable,true);
 const loading=groupTicketReadiness(p,actor,'loading'),failed=groupTicketReadiness(p,actor,'error');
 assert.equal(loading.summaryKey,'groups.readinessChecking');assert.equal(failed.summaryKey,'groups.readinessUnavailable');assert.equal(failed.ownTicketUsable,true,'confirmed own QR remains accessible during a failed refresh');
 assert.equal(groupTicketReadiness({...p,members:[yes]},actor).unknown,1,'missing legacy projection is not proof of no ticket');
 const known=groupTicketReadiness({...p,members:[{...yes,ticketState:'none',hasTicket:false}]},actor);
 assert.equal(known.complete,true);assert.equal(known.ready,0);assert.equal(known.summaryKey,'groups.summary');
});

test('readiness counts confirmed accepted people once without treating offers as ready',()=>{
 const p=outing(30,{chosenEventId:id(40),lifecycle:'event_selected',members:[
  {userId:actor,username:'QA',status:'accepted',attendance:'yes',ticketState:'used',hasTicket:true},
  {userId:id(3),username:'QA2',status:'accepted',attendance:'yes',ticketState:'offered',hasTicket:false},
  {userId:id(4),username:'QA3',status:'pending',attendance:'yes',ticketState:'valid',hasTicket:true},
  {userId:id(5),username:'QA4',status:'accepted',attendance:'no',ticketState:'valid',hasTicket:true},
 ]});
 const state=groupTicketReadiness(p,actor);assert.equal(state.confirmed,2);assert.equal(state.ready,1);assert.equal(state.allConfirmedReady,false);
 const all=groupTicketReadiness({...p,members:p.members.slice(0,1)},actor);assert.equal(all.allConfirmedReady,true);
 assert.equal(groupTicketReadiness({...p,chosenEventId:undefined},actor).summaryKey,'groups.comingCount');
});

test('fresh group detail overrides hydrated outing fields without dropping older paginated outings',async()=>{
 let revision=1;const fresh=()=>outing(30,{title:'Revision '+revision});const {store}=setup(async path=>path.endsWith('/messages')?{items:[],hasMore:false}:path==='/outings/groups'?[group()]:path.endsWith('/outings')?{items:[outing(31,{createdAt:'2026-10-01T00:00:00Z'})],hasMore:false}:group({outings:[fresh()]}));
 await store.load(gid);await store.loadHistory(gid);revision=2;await store.load(gid);await store.load();
 const plans=store.getSnapshot().groups[0]!.outings;assert.deepEqual(plans.map(p=>p.id),[id(30),id(31)]);assert.equal(plans[0]!.title,'Revision 2');
});

test('opening an old outing never changes the paginated history cursor',async()=>{
 const pages:string[]=[];const {store}=setup(async path=>{if(path.endsWith('/messages'))return{items:[],hasMore:false};if(path.startsWith('/outings/plans/'))return outing(90,{createdAt:'2020-01-01T00:00:00Z'});if(path.startsWith('/outings/groups/'+gid+'/outings')){pages.push(path);return{items:[outing(31)],hasMore:true}}return group()});
 await store.load(gid);await store.loadHistory(gid);await store.loadPlan(gid,id(90));await store.loadHistory(gid,true);assert.equal(pages.at(-1),'/outings/groups/'+gid+'/outings?before='+id(31));
});

test('failed read cursor retries during an unchanged focused poll, without duplicate acknowledgements',async()=>{
 let fail=true;const writes:number[]=[];const {store}=setup(async(path,method,body)=>{if(method==='POST'){writes.push(body.seq);if(fail){fail=false;throw Error('offline')}return{ok:true}}return path.endsWith('/messages')?{items:[message(1)],hasMore:false}:group({lastSeq:1})});
 await store.load(gid);assert.equal(await store.read(gid,1),false);await store.load(gid);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(writes,[1,1]);assert.equal(await store.read(gid,1),true);assert.deepEqual(writes,[1,1]);
});

test('revocation forgets lost-ack message retry keys before rejoining',async()=>{
 let current=group(),fail=true;const keys:string[]=[];const {store}=setup(async(path,method,body)=>{if(method==='POST'){keys.push(body.requestId);if(fail){fail=false;throw Error('lost ack')}return{ok:true}}return path.endsWith('/messages')?{items:[],hasMore:false}:clone(current)});
 await store.load(gid);store.draft(gid,'A private draft');await store.send(gid);current=group({status:'pending',joinedAt:undefined});await store.load(gid);current=group({joinedAt:'2026-11-15T20:00:00Z'});await store.load(gid);store.draft(gid,'A private draft');await store.send(gid);assert.notEqual(keys[0],keys[1]);
});
