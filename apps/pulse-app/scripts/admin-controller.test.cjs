const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hooks,modules,deferred,settle}=require('./helpers/qaHarness.cjs');

function fixture(role='admin') {
 const h=hooks(),request=deferred(),events=[];let retries=0,reads=0;
 let actor={properties:{id:'admin-A',role},retryEventCancellation:()=>{retries++;return request.promise;},listEventCancellationRequests:async()=>{reads++;return[];}};
 const translation={t:key=>key,i18n:{language:'en'}};
 const api=modules({react:h.react,'react-i18next':{useTranslation:()=>translation},'@/core/DataProviderContext':{useDataProvider:()=>({user:actor,logout(){}})},sonner:{toast:{success:value=>events.push(value),error:value=>events.push(value),info:value=>events.push(value)}}}).load('app/admin/useAdminOperations');
 const render=()=>h.render(()=>api.useAdminOperations({section:'cancellations'}));
 return {render,request,events,counts:()=>({retries,reads}),logout:()=>{actor=undefined;},dispose:()=>h.unmount()};
}
test('admin retry is private to the controller, locks before render and unlocks after completion',async()=>{
 const f=fixture();f.render();await settle();const model=f.render();
 const first=model.retryCancellation('request-A'),second=model.retryCancellation('request-A');
 assert.equal(f.counts().retries,1);assert.equal(f.render().retryingCancellationId,'request-A');
 f.request.resolve();await Promise.all([first,second]);
 assert.equal(f.counts().reads,2);assert.equal(f.render().retryingCancellationId,undefined);assert.equal(f.events.length,1);
 f.dispose();
});
test('logout ignores a late retry result and cannot fetch or publish privileged data',async()=>{
 const f=fixture();f.render();await settle();const pending=f.render().retryCancellation('request-A');
 f.logout();f.render();f.request.resolve();await pending;
 assert.equal(f.counts().reads,1);assert.equal(f.events.length,0);assert.equal(f.render().retryingCancellationId,undefined);f.dispose();
});
test('unmount cannot publish a retry response',async()=>{
 const f=fixture();f.render();await settle();const pending=f.render().retryCancellation('request-A');f.dispose();f.request.resolve();await pending;
 assert.equal(f.events.length,0);assert.equal(f.counts().reads,1);
});
test('non-admins cannot start cancellation retries',async()=>{
 const f=fixture('customer');const model=f.render();await model.retryCancellation('request-A');assert.equal(f.counts().retries,0);f.dispose();
});
