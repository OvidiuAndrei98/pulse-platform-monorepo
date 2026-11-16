import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {GroupsStore,type FriendGroup} from '@packages/app-core/social/groups';
import type {OutingPlan} from '@packages/app-core/outings/model';
import {ApiError,bindSession,createHttp} from '../src/data/http';

const id=(n:number)=>`33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const gid=id(1),actor=id(2),pid=id(3);
const plan=(revision=1):OutingPlan=>({id:pid,groupId:gid,ownerId:actor,title:'Transport review',status:'accepted',outingDate:revision===1?'2026-11-19':'2026-11-20',city:'Bucuresti',expiresAt:'2027-01-01T00:00:00Z',revision,members:[],options:[]});
const group=(revision=1):FriendGroup=>({id:gid,name:'Transport review',ownerId:actor,status:'accepted',revision,lastSeq:0,unread:0,muted:false,visibleAfterSeq:0,joinedAt:'2026-11-01T00:00:00Z',members:[{userId:actor,username:'Review',status:'accepted'}],outings:[plan(revision)],outingsHasMore:false,preview:''});
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const impact={availabilityResponses:2,eventPreferences:1,attendanceResponses:1,proposalsKept:0,proposalsIncompatible:1,destinationCleared:true,ticketsUnaffected:true};
afterEach(()=>bindSession({token:()=>null,expire:()=>{}}));

test('native transport preserves structured context impact without pretending the edit succeeded',async()=>{
 const payload={error:'CONTEXT_CONFIRMATION_REQUIRED',impact};
 const http=createHttp('https://review.invalid/api/v1',async()=>response(payload,409));
 await assert.rejects(http('/outings/plans/'+pid+'/context',{method:'POST',body:{revision:1,city:'Bucuresti',date:'2026-11-20'}}),error=>{
  assert.ok(error instanceof ApiError);assert.equal(error.status,409);assert.equal(error.code,'CONTEXT_CONFIRMATION_REQUIRED');assert.deepEqual(error.data,payload);return true;
 });
});

test('real native HTTP errors feed the shared confirmation and conflict states with their metadata',async()=>{
 let mode:'impact'|'conflict'|'success'='impact',revision=1;const writes:{path:string;body:any}[]=[];
 const http=createHttp('https://review.invalid/api/v1',async(input,options)=>{
  const path=new URL(String(input)).pathname.replace('/api/v1','');
  if(options?.method==='POST'){
   writes.push({path,body:JSON.parse(String(options.body))});
   if(mode==='impact')return response({error:'CONTEXT_CONFIRMATION_REQUIRED',impact},409);
   if(mode==='conflict')return response({error:'OUTING_EXISTS',existingPlanId:id(99)},409);
   revision=2;return response(plan(revision));
  }
  if(path.endsWith('/messages'))return response({items:[],hasMore:false});
  return response(group(revision));
 });
 let key=9000;
 const store=new GroupsStore((path,method,body,signal)=>http(path,{method,body,signal}),()=>true,()=>id(key++));
 await store.load(gid);const draft={revision:1,city:'Bucuresti',date:'2026-11-20'};
 assert.equal(await store.editContext(gid,pid,draft),undefined);assert.deepEqual(store.getSnapshot().contextImpact,impact);assert.equal(store.getSnapshot().groups[0]!.outings[0]!.outingDate,'2026-11-19');
 mode='conflict';assert.equal(await store.editContext(gid,pid,draft),undefined);assert.equal(store.getSnapshot().contextConflict,id(99));assert.equal(store.getSnapshot().contextImpact,null);
 mode='success';assert.ok(await store.editContext(gid,pid,{...draft,confirmImpact:true}));assert.equal(store.getSnapshot().groups[0]!.outings[0]!.outingDate,'2026-11-20');assert.equal(store.getSnapshot().contextError,null);
 assert.equal(writes.length,3);assert.ok(writes.every(write=>write.path==='/outings/plans/'+pid+'/context'));
 assert.deepEqual(writes[0]!.body,draft);assert.deepEqual(writes[1]!.body,draft);assert.deepEqual(writes[2]!.body,{...draft,confirmImpact:true});
});

test('non-outing error bodies stay excluded from the native error metadata',async()=>{
 const http=createHttp('https://review.invalid/api/v1',async()=>response({error:'INVALID_PAYMENT_RESPONSE',clientSecret:'synthetic-do-not-retain'},409));
 await assert.rejects(http('/events/'+id(20)+'/tickets/purchase',{method:'POST'}),error=>{assert.ok(error instanceof ApiError);assert.equal(error.data,undefined);return true});
});

test('purchase and free registration retain only bounded outing recovery metadata',async()=>{
 for(const action of ['purchase','book']){
  for(const reason of ['review_recipients','outing_changed','additional_ticket_confirmation','pending_access','recipient_unavailable']){
   const http=createHttp('https://review.invalid/api/v1',async()=>response({error:'OUTING_RECIPIENTS_CHANGED',reason,orderId:id(90),clientSecret:'synthetic-secret',stripeAccount:'synthetic-account',email:'private@example.invalid',recipients:[actor]},409));
   await assert.rejects(http(`/events/${id(20)}/tickets/${action}`,{method:'POST'}),error=>{
    assert.ok(error instanceof ApiError);assert.equal(error.status,409);assert.equal(error.code,'OUTING_RECIPIENTS_CHANGED');
    assert.deepEqual(error.data,{error:'OUTING_RECIPIENTS_CHANGED',reason},'No unrelated order, recipient or Stripe data may reach UI error metadata');return true;
   });
  }
 }
});

test('only existing-payment recovery can preserve a syntactically valid order UUID',async()=>{
 const validOrder='abcdef12-abcd-4abc-8abc-abcdef123456';
 for(const action of ['purchase','book']){
  for(const orderId of [validOrder,validOrder.toUpperCase(),'pi_test_secret','../orders/other','33333333-3333-4333-8333-000000000090?secret=1','',null,42,{id:id(90)}]){
   const http=createHttp('https://review.invalid/api/v1',async()=>response({error:'OUTING_RECIPIENTS_CHANGED',reason:'existing_payment',orderId,clientSecret:'must-not-survive'},409));
   await assert.rejects(http(`/events/${id(20)}/tickets/${action}`,{method:'POST'}),error=>{
    assert.ok(error instanceof ApiError);
    const expected:Record<string,unknown>={error:'OUTING_RECIPIENTS_CHANGED',reason:'existing_payment'};
    if(orderId===validOrder||orderId===validOrder.toUpperCase())expected.orderId=orderId;
    assert.deepEqual(error.data,expected);return true;
   });
  }
 }
});

test('unrecognized recovery reasons cannot smuggle arbitrary values through payment errors',async()=>{
 for(const reason of ['new_unrecognized_reason','existing_payment?secret=1',{kind:'existing_payment'},['existing_payment'],null,5]){
  const http=createHttp('https://review.invalid/api/v1',async()=>response({error:'OUTING_RECIPIENTS_CHANGED',reason,orderId:id(90),clientSecret:'must-not-survive'},409));
  await assert.rejects(http(`/events/${id(20)}/tickets/purchase`,{method:'POST'}),error=>{
   assert.ok(error instanceof ApiError);assert.deepEqual(error.data,{error:'OUTING_RECIPIENTS_CHANGED'});return true;
  });
 }
});

test('payment recovery metadata remains scoped to the exact purchase or book endpoint and error',async()=>{
 const payload={error:'OUTING_RECIPIENTS_CHANGED',reason:'existing_payment',orderId:id(90),clientSecret:'must-not-survive'};
 const http=createHttp('https://review.invalid/api/v1',async()=>response(payload,409));
 for(const path of [`/events/${id(20)}`,`/events/${id(20)}/tickets`,`/events/${id(20)}/tickets/purchase/extra`,`/events/${id(20)}/tickets/book/`,`/users/me/orders`,`/payments/status`,`/events/not-a-uuid/tickets/book`]){
  await assert.rejects(http(path,{method:'POST'}),error=>{assert.ok(error instanceof ApiError);assert.equal(error.data,undefined,path);return true});
 }
 for(const code of ['INVALID_PAYMENT_RESPONSE','CARD_DECLINED','HTTP_ERROR']){
  const other=createHttp('https://review.invalid/api/v1',async()=>response({...payload,error:code},409));
  await assert.rejects(other(`/events/${id(20)}/tickets/purchase`,{method:'POST'}),error=>{assert.ok(error instanceof ApiError);assert.equal(error.data,undefined);return true});
 }
});
