import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {GroupsStore,type FriendGroup} from '../src/social/groups';
import type {OutingPlan,OutingsRequest} from '../src/outings/model';
const id=(n:number)=>`44444444-4444-4444-8444-${String(n).padStart(12,'0')}`;
const gid=id(1),actor=id(2);
const group:FriendGroup={id:gid,name:'Pagination QA',ownerId:actor,status:'accepted',revision:1,lastSeq:0,unread:0,muted:false,visibleAfterSeq:0,joinedAt:'2026-11-01T00:00:00Z',members:[{userId:actor,username:'QA',status:'accepted'}],outings:[],outingsHasMore:true};
const message=(n:number)=>({id:id(1000+n),requestId:id(2000+n),seq:n*3,senderId:actor,username:'QA',kind:'event',content:'',eventId:id(3000+n),createdAt:'2026-11-15T20:00:00Z'});
const page=(low:number,high:number)=>Array.from({length:Math.max(0,high-low+1)},(_,i)=>message(high-i));
const setup=(handler:(path:string)=>Promise<any>)=>{let n=9000;return new GroupsStore(handler as OutingsRequest,()=>true,()=>id(n++))};

test('refreshing the first shared-event page preserves 65 loaded rows, its real tail cursor and known end',async()=>{
 const paths:string[]=[];
 const store=setup(async path=>{if(path.includes('collection=events')){paths.push(path);const before=new URL('https://local'+path).searchParams.get('before');return !before?{items:page(16,65),hasMore:true}:before==='48'?{items:page(1,15),hasMore:false}:{items:[],hasMore:false}}if(path.endsWith('/messages'))return{items:[],hasMore:false};return group});
 await store.load(gid);await store.collection(gid);await store.collection(gid,true);
 const original=store.getSnapshot().collection[gid]!.map(m=>m.id);assert.equal(original.length,65);assert.equal(store.getSnapshot().collectionMore[gid],false);
 await store.collection(gid,false);
 assert.deepEqual(store.getSnapshot().collection[gid]!.map(m=>m.id),original);assert.equal(store.getSnapshot().collectionMore[gid],false,'First-page hasMore does not invalidate the previously reached end');
 await store.collection(gid,true);assert.ok(paths.at(-1)!.endsWith('&before=3'),'The next older cursor remains the actual loaded tail, not the refreshed first page');
 assert.equal(store.getSnapshot().collection[gid]!.length,65);
});

test('a refreshed shared-event burst leaves a fillable gap without losing sparse older rows or the known end',async()=>{
 let head=65;const cursors:number[]=[];
 const store=setup(async path=>{if(path.includes('collection=events')){const before=Number(new URL('https://local'+path).searchParams.get('before')??Infinity);cursors.push(before);const all=page(1,head).filter(m=>m.seq<before);return{items:all.slice(0,50),hasMore:all.length>50}}if(path.endsWith('/messages'))return{items:[],hasMore:false};return group});
 await store.load(gid);await store.collection(gid);await store.collection(gid,true);head=200;await store.collection(gid);
 assert.equal(store.getSnapshot().collection[gid]!.length,115);assert.equal(store.getSnapshot().collectionMore[gid],true);
 await store.collection(gid,true);assert.equal(cursors.at(-1),453);await store.collection(gid,true);assert.equal(cursors.at(-1),303);
 assert.deepEqual(store.getSnapshot().collection[gid]!.map(m=>m.seq),page(1,200).map(m=>m.seq));
 assert.equal(store.getSnapshot().collectionMore[gid],false,'Bridging into the loaded old history must restore its known end');
});

test('an outing-history focus refresh keeps its loaded-tail cursor and known end after 65 outings',async()=>{
 const plans:OutingPlan[]=Array.from({length:65},(_,i)=>{const n=65-i;return{id:id(100+n),groupId:gid,ownerId:actor,title:'Night '+n,status:'accepted',revision:1,createdAt:new Date(Date.UTC(2026,10,1,0,n)).toISOString(),expiresAt:'2027-01-01T00:00:00Z',members:[],options:[]}});
 const paths:string[]=[];
 const store=setup(async path=>{if(path.startsWith('/outings/groups/'+gid+'/outings')){paths.push(path);const before=new URL('https://local'+path).searchParams.get('before'),start=before?plans.findIndex(p=>p.id===before)+1:0;return{items:plans.slice(start,start+20),hasMore:start+20<plans.length}}if(path.endsWith('/messages'))return{items:[],hasMore:false};return group});
 await store.load(gid);await store.loadHistory(gid);for(let i=0;i<3;i++)await store.loadHistory(gid,true);
 assert.equal(store.getSnapshot().groups[0]!.outings.length,65);assert.equal(store.getSnapshot().historyMore[gid],false);
 await store.loadHistory(gid,false);assert.equal(store.getSnapshot().groups[0]!.outings.length,65);assert.equal(store.getSnapshot().historyMore[gid],false);
 await store.loadHistory(gid,true);assert.ok(paths.at(-1)!.endsWith('?before='+plans.at(-1)!.id));
});

test('refresh hydrates an explicitly referenced source older than fifty messages without losing its history gap',async()=>{
 const source={...message(1),seq:1};
 const planId=id(990),linked={...source,outingId:planId,referenceMessageId:source.id};
 const plan:OutingPlan={id:planId,groupId:gid,ownerId:actor,title:'Night',status:'accepted',revision:1,expiresAt:'2027-01-01T00:00:00Z',members:[],options:[{eventId:source.eventId,title:'Night',location:'Venue',startTime:'2026-11-20T20:00:00Z',available:true,referenceMessageId:source.id}]};
 let loaded=false;const requests:string[]=[];
 const store=setup(async path=>{
  if(path.includes('/messages')){
   requests.push(path);const before=new URL('https://local'+path).searchParams.get('before');
   if(before)return{items:[source],hasMore:false};
   return loaded?{items:page(16,65),hasMore:true,references:[linked]}:{items:[source],hasMore:false};
  }
  return {...group,outings:loaded?[plan]:[]};
 });
 await store.load(gid);loaded=true;await store.load(gid);
 const cached=store.getSnapshot().messages[gid]!.find(m=>m.id===source.id)!;
 assert.equal(cached.outingId,planId);assert.equal(cached.referenceMessageId,source.id);
 assert.ok(requests.at(-1)?.includes('references='+source.id));
 await store.loadMessages(gid,true);
 assert.equal(new URL('https://local'+requests.at(-1)).searchParams.get('before'),'48','The refreshed head boundary, not the old source, is the missing-page cursor');
});

test('a terminal history page clears Earlier messages after filling a targeted-reference gap',async()=>{
 const all=Array.from({length:60},(_,i)=>({...message(60-i),seq:60-i}));
 const source=all.at(-1)!;
 const requests:string[]=[];
 const store=setup(async path=>{
  if(path.includes('/messages')){
   requests.push(path);const before=Number(new URL('https://local'+path).searchParams.get('before')??Infinity);
   const remaining=all.filter(m=>m.seq<before);
   return{items:remaining.slice(0,50),hasMore:remaining.length>50,references:[source]};
  }
  return group;
 });
 await store.load(gid);
 assert.equal(store.getSnapshot().messages[gid]!.length,51);
 assert.equal(store.getSnapshot().more[gid],true);
 await store.loadMessages(gid,true);
 assert.equal(new URL('https://local'+requests.at(-1)).searchParams.get('before'),'11');
 assert.deepEqual(store.getSnapshot().messages[gid]!.map(m=>m.seq),all.map(m=>m.seq));
 assert.equal(store.getSnapshot().more[gid],false,'The exhausted ordinary page also closes targeted-reference gaps');
 await store.loadMessages(gid);
 assert.equal(store.getSnapshot().more[gid],false,'Refreshing the head must preserve the known beginning');
});
