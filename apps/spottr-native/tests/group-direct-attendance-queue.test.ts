import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {GroupActionError} from '@packages/app-core/social/groups';
const {hooks,modules,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function fixture(initial:'yes'|'no'|'unanswered'='unanswered'){
 const h=hooks(),requests:{answer:string;reply:ReturnType<typeof deferred>}[]=[],state={current:initial,scope:'plan:round1:actor',allowed:true,busy:false};
 const {useDirectAttendance}=modules({react:h.react,'@packages/app-core/social/groups':{GroupActionError}}).load(path.resolve(__dirname,'../src/groups/useDirectAttendance.ts'));
 const draw=()=>h.render(()=>useDirectAttendance({...state,save:(answer:string)=>{const reply=deferred();state.busy=true;requests.push({answer,reply});return reply.promise},getError:()=>null}));
 const finish=async(index:number)=>{state.current=requests[index]!.answer as typeof state.current;state.busy=false;requests[index]!.reply.resolve({ok:true});await settle()};
 return{h,state,requests,draw,finish};
}

test('tapping the selected response directly queues unanswered without another surface',async()=>{
 const f=fixture('yes');void f.draw().choose('yes');assert.equal(f.requests[0]!.answer,'unanswered');assert.equal(f.draw().pending,'unanswered');await f.finish(0);assert.equal(f.draw().pending,null);assert.equal(f.state.current,'unanswered');f.h.unmount();
});

test('rapid alternating taps serialize and an old acknowledgement cannot replace the latest visible intent',async()=>{
 const f=fixture();void f.draw().choose('yes');void f.draw().choose('no');let action=f.draw();assert.equal(action.pending,'no');assert.equal(action.disabled,false);assert.equal(f.requests.length,1);
 await f.finish(0);action=f.draw();assert.equal(f.requests.length,2);assert.equal(f.requests[1]!.answer,'no');assert.equal(action.pending,'no','The acknowledged yes is not flashed while no is queued');
 await f.finish(1);assert.equal(f.state.current,'no');assert.equal(f.draw().pending,null);f.h.unmount();
});

test('intermediate intents are replaced and a return to the acknowledged choice does not write again',async()=>{
 const f=fixture();void f.draw().choose('yes');void f.draw().choose('no');void f.draw().choose('yes');await f.finish(0);assert.equal(f.requests.length,1);assert.equal(f.state.current,'yes');assert.equal(f.draw().pending,null);f.h.unmount();
});

test('a failed final request keeps the confirmed answer and retries only the explicit failed value',async()=>{
 const f=fixture('yes');void f.draw().choose('no');f.state.busy=false;f.requests[0]!.reply.reject(Error('offline'));await settle();let action=f.draw();assert.equal(f.state.current,'yes');assert.equal(action.pending,null);assert.equal(action.failure.value,'no');
 void action.retry();assert.equal(f.requests[1]!.answer,'no');await f.finish(1);action=f.draw();assert.equal(action.failure,null);assert.equal(f.state.current,'no');f.h.unmount();
});

test('a context conflict stops queued old-round intents instead of replaying them to another destination',async()=>{
 const f=fixture();void f.draw().choose('yes');void f.draw().choose('no');f.state.busy=false;f.requests[0]!.reply.reject(new GroupActionError('groups.responseContextChanged'));await settle();assert.equal(f.requests.length,1);assert.equal(f.draw().failure.key,'groups.responseContextChanged');f.h.unmount();
});

test('a round change or unmount cannot submit the queued attendance',async()=>{
 const f=fixture();void f.draw().choose('yes');void f.draw().choose('no');f.state.scope='plan:round2:actor';f.draw();await f.finish(0);assert.equal(f.requests.length,1);f.h.unmount();
 const unmounted=fixture();void unmounted.draw().choose('yes');void unmounted.draw().choose('no');unmounted.h.unmount();await unmounted.finish(0);assert.equal(unmounted.requests.length,1);
});

test('other in-flight mutations and revoked voting permission do not authorize new writes',async()=>{
 const f=fixture();f.state.busy=true;let action=f.draw();assert.equal(action.disabled,true);await action.choose('yes');assert.equal(f.requests.length,0);
 f.state.busy=false;f.state.allowed=false;action=f.draw();await action.choose('no');assert.equal(f.requests.length,0);f.h.unmount();
});
