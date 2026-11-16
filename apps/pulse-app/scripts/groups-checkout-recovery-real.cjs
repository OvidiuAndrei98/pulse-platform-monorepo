// Actual local HTTP/Go/PostgreSQL recovery checks. Free order only: no Stripe provider.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../api/.tmp/friends-browser-fixture.json'),'utf8'));
if(!fixture.testOnly||!['localhost','127.0.0.1'].includes(new URL(fixture.baseUrl).hostname))throw Error('LOCAL_FIXTURE_ONLY');
const calls=[];
async function api(actor,route,body){
 const response=await fetch(fixture.baseUrl+'/api/v1'+route,{method:body?'POST':'GET',headers:{...(actor===null?{}:{authorization:'Bearer '+fixture.actors[actor].token}),'content-type':'application/json',...(route.endsWith('/tickets/book')?{'idempotency-key':crypto.randomUUID()}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();calls.push({route,status:response.status});return {status:response.status,data};
}
(async()=>{
 const booked=await api(0,'/events/'+fixture.freeEventId+'/tickets/book',{items:[{ticketTypeId:fixture.freeTicketTypeId,quantity:1}]});
 assert.equal(booked.status,200);assert.ok(booked.data.orderId);
 const body={orderId:booked.data.orderId,eventId:fixture.freeEventId},ticketsBefore=await api(0,'/users/me/tickets');assert.equal(ticketsBefore.status,200);
 for(const action of ['check','cancel']){const result=await api(0,'/checkout/recover',{...body,action});assert.equal(result.status,200);assert.deepEqual(result.data,{status:'completed',orderId:body.orderId,paymentAttempted:true});}
 const ticketsAfter=await api(0,'/users/me/tickets');assert.deepEqual(ticketsAfter.data,ticketsBefore.data);
 for(const action of ['check','cancel'])assert.equal((await api(1,'/checkout/recover',{...body,action})).status,404);
 assert.equal((await api(0,'/checkout/recover',{...body,eventId:fixture.eventIds.find(id=>id!==fixture.freeEventId),action:'check'})).status,404);
 assert.equal((await api(0,'/checkout/recover',{...body,orderId:crypto.randomUUID(),action:'check'})).status,404);
 assert.equal((await api(null,'/checkout/recover',{...body,action:'check'})).status,401);
 const evidence={success:true,checks:['real free order recovery returns completed','explicit cancel cannot refund/revoke an already completed order','different buyer cannot read or cancel order','event binding and unknown order fail closed','unauthenticated recovery denied'],calls,completedAt:new Date().toISOString(),boundary:'Actual isolated HTTP/Go/PostgreSQL; no Stripe provider or charged payment'};
 fs.mkdirSync(path.join(__dirname,'../.tmp'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../.tmp/groups-checkout-recovery-real.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
