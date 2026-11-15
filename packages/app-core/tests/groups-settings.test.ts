import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {GroupsStore,GroupActionError,groupFailure,type FriendGroup} from '../src/social/groups';
import type {OutingPlan,OutingsRequest} from '../src/outings/model';
const id=(n:number)=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const gid=id(1),actor=id(2),pid=id(30);
const plan=(patch:Partial<OutingPlan>={}):OutingPlan=>({id:pid,groupId:gid,ownerId:actor,title:'18 November',status:'accepted',outingDate:'2026-11-18',city:'Bucuresti',revision:1,expiresAt:'2027-01-01T00:00:00Z',members:[],options:[],...patch});
const group=(patch:Partial<FriendGroup>={}):FriendGroup=>({id:gid,name:'Group settings QA',ownerId:actor,status:'accepted',revision:1,lastSeq:1,unread:0,muted:false,visibleAfterSeq:0,joinedAt:'2026-11-01T00:00:00Z',members:[{userId:actor,username:'QA member',status:'accepted'}],outings:[plan()],outingsHasMore:false,...patch});
const message={id:id(80),requestId:id(81),seq:1,senderId:actor,username:'QA member',kind:'event',content:'',eventId:id(82),createdAt:'2026-11-15T00:00:00Z'};
const page={items:[message],hasMore:false};
const setup=(request:(path:string,method:string,body:any)=>Promise<any>)=>{let n=9000;return new GroupsStore(request as OutingsRequest,()=>true,()=>id(n++))};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r});return{promise,resolve}}

test('operation errors are mapped by their real code before generic HTTP status',()=>{
 assert.equal(groupFailure({status:403,code:'OUTING_EDIT_FORBIDDEN'}),'groups.OUTING_EDIT_FORBIDDEN');
 assert.equal(groupFailure({status:404,data:{error:'GROUP_ADMIN_REQUIRED'}}),'groups.groupOwnerOnly');
 assert.equal(groupFailure({status:404,code:'OUTING_EXISTS'}),'groups.errors.OUTING_EXISTS');
 assert.equal(groupFailure({status:404,code:'NOT_FOUND'}),'groups.operationUnavailable');
 assert.equal(groupFailure({status:405}),'groups.operationUnavailable');
 assert.equal(groupFailure({status:403,code:'This endpoint is not available in the preview proxy.'}),'groups.operationUnavailable');
 assert.equal(groupFailure({status:403}),'groups.actionForbidden');
 assert.equal(groupFailure({status:404,code:'GROUP_ACCESS_LOST'}),'groups.accessLost');
});

test('inline vote failures have one scoped owner, keep canonical responses and permit retry',async()=>{
 let failure:unknown={status:503},saved=false;const store=setup(async(path,method)=>{
  if(method==='POST'){if(failure)throw failure;saved=true;return{ok:true}}
  if(path.endsWith('/messages'))return page;
  return group({outings:[plan({members:[{userId:actor,username:'QA member',status:'accepted',attendance:saved?'yes':'unanswered'}]})]});
 });
 await store.load(gid);
 await assert.rejects(store.planAction(gid,pid,'attendance',{answer:'yes'},{feedback:'inline'}),e=>e instanceof GroupActionError&&e.key==='groups.failed');
 assert.equal(store.getSnapshot().error,null);assert.equal(store.getSnapshot().busy,false);
 assert.equal(store.getSnapshot().groups[0]!.outings[0]!.members[0]!.attendance,'unanswered');
 failure=undefined;assert.deepEqual(await store.planAction(gid,pid,'attendance',{answer:'yes'},{feedback:'inline'}),{ok:true});
 assert.equal(store.getSnapshot().groups[0]!.outings[0]!.members[0]!.attendance,'yes');
 failure={status:503};assert.equal(await store.planAction(gid,pid,'attendance',{answer:'no'}),undefined);
 assert.equal(store.getSnapshot().error,'groups.failed','Existing callers retain global feedback');
});

test('inline action feedback never bypasses membership verification or private data purge',async()=>{
 let removed=false;const store=setup(async(path,method)=>{
  if(method==='POST')throw{status:404,code:'NOT_FOUND'};
  if(removed){if(path==='/outings/groups')return[];throw{status:404,code:'GROUP_ACCESS_LOST'}}
  if(path.endsWith('/messages'))return page;return group();
 });
 await store.load(gid);store.draft(gid,'Private draft');removed=true;
 await assert.rejects(store.planAction(gid,pid,'vote',{eventId:id(82),answer:'yes'},{feedback:'inline'}),e=>e instanceof GroupActionError&&e.key==='groups.accessLost');
 assert.equal(store.getSnapshot().groups.length,0);assert.equal(store.getSnapshot().messages[gid],undefined);assert.equal(store.getSnapshot().drafts[gid],undefined);
 assert.deepEqual(store.getSnapshot().revoked,[gid]);assert.equal(store.getSnapshot().error,null);assert.equal(store.getSnapshot().busy,false);
});

test('an existing outing returned by create stays hydrated beyond the 20-row detail slice without rolling back newer state',async()=>{
 const existing=plan({createdAt:'2026-11-01T00:00:00Z',revision:2});
 const firstPage=Array.from({length:20},(_,i)=>plan({id:id(100+i),createdAt:`2026-11-${String(i+2).padStart(2,'0')}T00:00:00Z`}));
 let response=existing;const store=setup(async(path,method)=>{if(method==='POST')return response;if(path.endsWith('/messages'))return page;return group({outings:firstPage,outingsHasMore:true})});
 await store.load(gid);assert.equal(store.getSnapshot().groups[0]!.outings.some(p=>p.id===pid),false);
 assert.equal((await store.createOuting(gid,{eventId:id(82)}))!.id,pid);
 assert.equal(store.getSnapshot().groups[0]!.outings.length,21);assert.equal(store.getSnapshot().groups[0]!.outings.find(p=>p.id===pid)!.revision,2);
 response={...existing,revision:1,title:'Older response'};await store.createOuting(gid,{eventId:id(82)});
 assert.equal(store.getSnapshot().groups[0]!.outings.find(p=>p.id===pid)!.revision,2);assert.equal(store.getSnapshot().groups[0]!.outings.find(p=>p.id===pid)!.title,existing.title);
});

test('Save 18→25 with a missing operation preserves the group, saved context, messages and edit payload',async()=>{
 let fail=false;const payload={revision:1,date:'2026-11-25',city:'Bucuresti'};
 const store=setup(async(path,method)=>{if(method==='POST'&&fail)throw{status:404,code:'NOT_FOUND'};if(path.endsWith('/messages'))return page;return group()});
 await store.load(gid);store.draft(gid,'Unsent message');fail=true;
 assert.equal(await store.editContext(gid,pid,payload),undefined);
 const state=store.getSnapshot();
 assert.equal(state.contextError,'groups.operationUnavailable');assert.equal(state.groups[0]!.outings[0]!.outingDate,'2026-11-18');
 assert.equal(state.messages[gid]![0]!.id,message.id);assert.equal(state.drafts[gid],'Unsent message');assert.equal(state.revoked.includes(gid),false);
 assert.deepEqual(payload,{revision:1,date:'2026-11-25',city:'Bucuresti'});
});

test('a legitimate coordinator or administrator refusal never ejects an accepted group member',async()=>{
 let failure:any;const store=setup(async(path,method)=>{if(method==='POST')throw failure;if(path.endsWith('/messages'))return page;return group()});
 await store.load(gid);
 failure={status:403,code:'OUTING_EDIT_FORBIDDEN'};await store.editContext(gid,pid,{revision:1,date:'2026-11-25',city:'Bucuresti'});
 assert.equal(store.getSnapshot().contextError,'groups.OUTING_EDIT_FORBIDDEN');assert.equal(store.getSnapshot().groups.length,1);
 failure={status:403,code:'GROUP_ADMIN_REQUIRED'};await store.action(gid,{action:'rename',name:'Not administrator'});
 assert.equal(store.getSnapshot().error,'groups.groupOwnerOnly');assert.equal(store.getSnapshot().revoked.length,0);
});

test('a 404 on canonical detail is not enough when its route is unavailable but the real group list still contains membership',async()=>{
 let fail=false;const store=setup(async(path)=>{if(path.endsWith('/messages'))return page;if(path==='/outings/groups')return[group()];if(fail)throw{status:404,code:'NOT_FOUND'};return group()});
 await store.load(gid);fail=true;await store.load(gid);
 assert.equal(store.getSnapshot().groups.length,1);assert.equal(store.getSnapshot().messages[gid]!.length,1);assert.equal(store.getSnapshot().error,'groups.operationUnavailable');
});

test('old API membership loss is confirmed by an available authoritative group list before purging',async()=>{
 let removed=false;const store=setup(async(path)=>{if(path.endsWith('/messages'))return page;if(removed){if(path==='/outings/groups')return[];throw{status:404,code:'NOT_FOUND'}}return group()});
 await store.load(gid);store.draft(gid,'Private');removed=true;await store.load(gid);
 assert.equal(store.getSnapshot().revoked.includes(gid),true);assert.equal(store.getSnapshot().messages[gid],undefined);assert.equal(store.getSnapshot().drafts[gid],undefined);
});

test('an ambiguous Forbidden response is verified, while unavailable verification cannot manufacture lost membership',async()=>{
 for(const absent of [false,true]){
  let denied=false;const store=setup(async(path)=>{if(denied){if(path==='/outings/groups'&&absent)return[];throw{status:403,title:'Forbidden'}}if(path.endsWith('/messages'))return page;return group()});
  await store.load(gid);denied=true;await store.load(gid);
  assert.equal(store.getSnapshot().revoked.includes(gid),absent);
  assert.equal(store.getSnapshot().error,absent?'groups.accessLost':'groups.actionForbidden');
 }
});

test('true access loss purges private collection/history state and ignores later old-membership responses',async()=>{
 const pending=deferred<any>();let mode='normal';
 const store=setup(async(path,method)=>{
  if(mode==='revoked'){if(path==='/outings/groups/'+gid)throw{status:404,code:'GROUP_ACCESS_LOST'};throw{status:404,code:'NOT_FOUND'}}
  if(path.includes('collection=events'))return mode==='pending'?pending.promise:page;
  if(path.endsWith('/messages'))return page;if(path.endsWith('/outings'))return{items:[plan()],hasMore:false};if(method==='POST')return{ok:true};return group();
 });
 await store.load(gid);await store.collection(gid);await store.loadHistory(gid);store.draft(gid,'Private');
 mode='pending';const read=store.collection(gid);mode='revoked';await store.editContext(gid,pid,{revision:1,date:'2026-11-25',city:'Bucuresti'});
 pending.resolve(page);await read;
 const state=store.getSnapshot();assert.equal(state.revoked.includes(gid),true);assert.equal(state.groups.length,0);assert.equal(state.collection[gid],undefined);assert.equal(state.historyStatus[gid],undefined);assert.equal(state.collectionStatus[gid],undefined);assert.equal(state.messages[gid],undefined);assert.equal(state.drafts[gid],undefined);
});

test('pending membership is displayed without restoring private accepted-member history',async()=>{
 let pending=false;const store=setup(async(path,method)=>{if(method==='POST')throw{status:404,code:'NOT_FOUND'};if(path.endsWith('/messages'))return page;return pending?group({status:'pending',outings:[],joinedAt:undefined,lastSeq:0}):group()});
 await store.load(gid);pending=true;await store.editContext(gid,pid,{revision:1,date:'2026-11-25',city:'Bucuresti'});
 assert.equal(store.getSnapshot().groups[0]!.status,'pending');assert.equal(store.getSnapshot().messages[gid],undefined);assert.equal(store.getSnapshot().contextError,'groups.invitationPending');
});

test('collection and history show scoped loading, genuine empty, error and retry without a focused poll erasing the error',async()=>{
 const pending=deferred<any>();let mode='pending';const store=setup(async(path)=>{
  if(path.includes('collection=events')){if(mode==='pending')return pending.promise;if(mode==='fail')throw{status:503};return{items:[],hasMore:false}}
  if(path.endsWith('/outings')){if(mode==='fail')throw{status:503};return{items:[],hasMore:false}}
  if(path.endsWith('/messages'))return page;return group();
 });
 await store.load(gid);const first=store.collection(gid);assert.equal(store.getSnapshot().collectionStatus[gid],'loading');
 pending.resolve({items:[],hasMore:false});await first;assert.equal(store.getSnapshot().collectionStatus[gid],'success');assert.deepEqual(store.getSnapshot().collection[gid],[]);
 mode='fail';await store.collection(gid);await store.loadHistory(gid);
 assert.equal(store.getSnapshot().collectionStatus[gid],'error');assert.equal(store.getSnapshot().collectionError[gid],'groups.collectionLoadFailed');assert.equal(store.getSnapshot().historyError[gid],'groups.historyLoadFailed');
 await store.load(gid);assert.equal(store.getSnapshot().collectionError[gid],'groups.collectionLoadFailed');assert.equal(store.getSnapshot().historyStatus[gid],'error');
 mode='retry';await store.collection(gid);await store.loadHistory(gid);
 assert.equal(store.getSnapshot().collectionStatus[gid],'success');assert.equal(store.getSnapshot().historyStatus[gid],'success');assert.equal(store.getSnapshot().historyError[gid],null);
});

test('an unrelated acknowledged action cannot strand a scoped list in loading or apply an old outing snapshot',async()=>{
 const pending=deferred<any>();let wait=true;const store=setup(async(path,method)=>{if(method==='POST')return{ok:true};if(path.endsWith('/outings'))return wait?pending.promise:{items:[plan({revision:2})],hasMore:false};if(path.endsWith('/messages'))return page;return group()});
 await store.load(gid);const read=store.loadHistory(gid);await store.action(gid,{action:'mute',muted:true});wait=false;pending.resolve({items:[plan()],hasMore:false});await read;
 assert.equal(store.getSnapshot().groups[0]!.outings[0]!.revision,2);assert.equal(store.getSnapshot().historyStatus[gid],'success','A superseded list refreshes without waiting for the page to remount');
});

test('pending invitations never fetch private collection or outing-history endpoints',async()=>{
 const paths:string[]=[];const store=setup(async(path)=>{paths.push(path);return group({status:'pending',outings:[],joinedAt:undefined,lastSeq:0})});
 await store.load(gid);await store.collection(gid);await store.loadHistory(gid);assert.deepEqual(paths,['/outings/groups/'+gid]);
});

test('a closed editor cannot put its late confirmation or error into a newly opened editor',async()=>{
 for(const failure of [
  {status:409,code:'CONTEXT_CONFIRMATION_REQUIRED',data:{impact:{availabilityResponses:1,eventPreferences:0,attendanceResponses:0,proposalsKept:0,proposalsIncompatible:0,destinationCleared:false,ticketsUnaffected:true}}},
  {status:409,code:'OUTING_EXISTS',data:{existingPlanId:id(31)}},
  {status:403,code:'OUTING_EDIT_FORBIDDEN'},
 ]){
  const pending=deferred<any>();const store=setup(async(path,method)=>{if(method==='POST')return pending.promise;if(path.endsWith('/messages'))return page;return group()});
  await store.load(gid);const old=store.editContext(gid,pid,{revision:1,date:'2026-11-25',city:'Bucuresti'});
  store.resetContextFeedback(); // close old editor; the next one owns feedback.
  pending.resolve(Promise.reject(failure));await old;
  assert.equal(store.getSnapshot().contextError,null);assert.equal(store.getSnapshot().contextImpact,null);assert.equal(store.getSnapshot().contextConflict,null);assert.equal(store.getSnapshot().busy,false);
 }
});

test('closing an editor cancels its feedback, not a real acknowledged server update',async()=>{
 const pending=deferred<any>();let saved=false;
 const store=setup(async(path,method)=>{if(method==='POST')return pending.promise;if(path.endsWith('/messages'))return page;return group({outings:[plan(saved?{outingDate:'2026-11-25',revision:2}:{})]})});
 await store.load(gid);const old=store.editContext(gid,pid,{revision:1,date:'2026-11-25',city:'Bucuresti'});store.resetContextFeedback();saved=true;
 pending.resolve(plan({outingDate:'2026-11-25',revision:2}));await old;
 assert.equal(store.getSnapshot().groups[0]!.outings[0]!.outingDate,'2026-11-25');assert.equal(store.getSnapshot().contextError,null);
});

test('a history page started during a save cannot replace the newer acknowledged outing revision',async()=>{
 const save=deferred<any>(),history=deferred<any>();let changed=false;
 const store=setup(async(path,method)=>{if(method==='POST')return save.promise;if(path.endsWith('/outings'))return history.promise;if(path.endsWith('/messages'))return page;return group({outings:[plan(changed?{outingDate:'2026-11-25',revision:2}:{})]})});
 await store.load(gid);const pendingSave=store.editContext(gid,pid,{revision:1,date:'2026-11-25',city:'Bucuresti'});const pendingHistory=store.loadHistory(gid);
 changed=true;save.resolve(plan({outingDate:'2026-11-25',revision:2}));await pendingSave;
 history.resolve({items:[plan()],hasMore:false});await pendingHistory;
 assert.equal(store.getSnapshot().groups[0]!.outings[0]!.outingDate,'2026-11-25');assert.equal(store.getSnapshot().groups[0]!.outings[0]!.revision,2);
});

test('an old-membership collection completes with a fresh authorized page after rejoin, never the old private history',async()=>{
 const pending=deferred<any>();let mode='initial',current=group();
 const store=setup(async(path)=>{if(path.includes('collection=events'))return mode==='old'?pending.promise:{items:[{...message,id:id(85),seq:5}],hasMore:false};if(path.endsWith('/messages'))return page;return current});
 await store.load(gid);mode='old';const read=store.collection(gid);
 current=group({joinedAt:'2026-11-15T22:00:00Z',visibleAfterSeq:4});await store.load(gid);mode='fresh';pending.resolve(page);await read;
 assert.deepEqual(store.getSnapshot().collection[gid]!.map(m=>m.seq),[5]);assert.equal(store.getSnapshot().collectionStatus[gid],'success');
});

test('sent and received activity reorder cached groups using server timestamps rather than cross-group sequences',async()=>{
 let groups=[group({activityAt:'2026-11-15T20:00:00Z',lastSeq:99}),group({id:id(4),activityAt:'2026-11-15T21:00:00Z',lastSeq:1})];
 const store=setup(async(path,method)=>{if(method==='POST'){groups=groups.map(g=>g.id===gid?{...g,lastSeq:100,activityAt:'2026-11-15T22:00:00Z'}:g);return{ok:true}}if(path.endsWith('/messages'))return page;return path==='/outings/groups'?groups:groups.find(g=>path.endsWith(g.id))});
 await store.load();assert.deepEqual(store.getSnapshot().groups.map(g=>g.id),[id(4),gid]);
 store.draft(gid,'New sent activity');await store.send(gid);assert.deepEqual(store.getSnapshot().groups.map(g=>g.id),[gid,id(4)]);
 groups=groups.map(g=>g.id===id(4)?{...g,lastSeq:2,activityAt:'2026-11-15T23:00:00Z'}:g);await store.load(id(4));
 assert.deepEqual(store.getSnapshot().groups.map(g=>g.id),[id(4),gid]);
});

test('activity ordering preserves actual sub-millisecond server precision',async()=>{
 const store=setup(async()=>[group({activityAt:'2026-11-15T20:00:00.123001Z'}),group({id:id(4),activityAt:'2026-11-15T20:00:00.123999Z'})]);
 await store.load();assert.deepEqual(store.getSnapshot().groups.map(g=>g.id),[id(4),gid]);
});

test('legacy detail activity reloads authoritative list order without inventing missing timestamps',async()=>{
 let received=false,listReads=0;const first=()=>group({lastSeq:99}),second=()=>group({id:id(4),lastSeq:received?1:0});
 const store=setup(async(path)=>{if(path.endsWith('/messages'))return page;if(path==='/outings/groups'){listReads++;return received?[second(),first()]:[first(),second()]}return second()});
 await store.load();received=true;await store.load(id(4));
 assert.equal(listReads,2);assert.deepEqual(store.getSnapshot().groups.map(g=>g.id),[id(4),gid]);assert.ok(store.getSnapshot().groups.every(g=>g.activityAt===undefined));
});

test('a delayed list captured during Send cannot undo newer acknowledged activity from the same group',async()=>{
 const posting=deferred<any>(),oldList=deferred<any>();let phase='initial';
 const first=group({activityAt:'2026-11-15T20:00:00Z',lastSeq:1}),second=group({id:id(4),activityAt:'2026-11-15T21:00:00Z'});
 const store=setup(async(path,method)=>{if(method==='POST')return posting.promise;if(path.endsWith('/messages'))return page;if(path==='/outings/groups')return phase==='initial'?[first,second]:oldList.promise;return{...first,revision:2,lastSeq:2,activityAt:'2026-11-15T22:00:00Z'}});
 await store.load();store.draft(gid,'Send');phase='sending';const sent=store.send(gid),poll=store.load();
 posting.resolve({ok:true});await sent;oldList.resolve([first,second]);await poll;
 assert.deepEqual(store.getSnapshot().groups.map(g=>g.id),[gid,id(4)]);assert.equal(store.getSnapshot().groups[0]!.lastSeq,2);assert.equal(store.getSnapshot().groups[0]!.activityAt,'2026-11-15T22:00:00Z');
});
