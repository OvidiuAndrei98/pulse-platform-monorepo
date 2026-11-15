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
