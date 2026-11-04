import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutingsStore,parsePlans,planningToday,planningBoundary,planVoteCount,type OutingPlan,type OutingsRequest } from '../src/outings/model';
import { defaultDecisionAt,responseCount,validBudget,optionVoters,planNightEnded } from '../src/outings/presentation';

const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const plan:OutingPlan={id:id(1),ownerId:id(2),title:'Friday',status:'accepted',expiresAt:'2099-01-02T00:00:00Z',revision:2,members:[{userId:id(2),username:'A',status:'accepted'},{userId:id(3),username:'B',status:'accepted'}],options:[],candidateDates:[{date:'2099-01-01',responses:[{userId:id(2),answer:'yes'},{userId:id(3),answer:'maybe'}]}]};
test('night boundaries include after midnight and adjust across Romanian DST',()=>{
 assert.equal(planningToday(new Date('2026-11-03T00:30:00Z')),'2026-11-02');
 assert.equal(planningToday(new Date('2026-11-03T04:00:00Z')),'2026-11-03');
 assert.equal(Date.parse(planningBoundary('2026-03-29'))-Date.parse(planningBoundary('2026-03-28')),23*3600000);
 assert.equal(Date.parse(planningBoundary('2026-10-25'))-Date.parse(planningBoundary('2026-10-24')),25*3600000);
 const now=Date.parse('2026-11-03T03:30:00Z'),deadline=Date.parse(defaultDecisionAt(['2026-11-02'],now));
 assert.ok(deadline>now&&deadline<Date.parse('2026-11-03T04:00:00Z'));
});
test('multi-option preferences count each participant once',()=>{
 assert.equal(responseCount(plan),2);
 const options=[4,5].map(n=>({eventId:id(n),title:'Event',location:'Venue',startTime:'2099-01-01T20:00:00Z',available:true,reactions:[{userId:id(2),answer:'yes' as const},{userId:id(3),answer:'maybe' as const}]}));
 const voting={...plan,outingDate:'2099-01-01',options};assert.equal(responseCount(voting),2);
 assert.deepEqual(optionVoters(voting,id(4)).map(m=>m.userId),[id(2)]);
 assert.deepEqual(optionVoters(voting,id(5)).map(m=>m.userId),[id(2)]);
 assert.equal(planVoteCount(voting,id(4)),1);
 assert.equal(planVoteCount(voting,id(5)),1);
 const legacy={...voting,options:options.map(({reactions,...o})=>o),members:[{...plan.members[0],voteEventId:id(4)},plan.members[1]]};
 assert.equal(responseCount(legacy),1);assert.equal(planVoteCount(legacy,id(4)),1);
});

test('a finished Romanian night is read-only even before plan retention expires',()=>{
 const p={outingDate:'2026-10-24',expiresAt:'2026-10-27T00:00:00Z'};
 assert.equal(planNightEnded(p,Date.parse('2026-10-25T03:59:59Z')),false);
 assert.equal(planNightEnded(p,Date.parse('2026-10-25T04:00:00Z')),true);
 assert.equal(planNightEnded({expiresAt:'2026-10-25T04:00:00Z'},Date.parse('2026-10-25T04:00:00Z')),true);
});
test('optional budgets and new server responses are validated',()=>{
 for(const value of ['', '0','50','99,50','1000000.00'])assert.equal(validBudget(value),true,value);
 for(const value of ['-1','1.001','Infinity','1000000.01','€10'])assert.equal(validBudget(value),false,value);
 assert.equal(parsePlans([plan])[0]?.revision,2);
 for(const patch of [{revision:-1},{decisionAt:'bad'},{myBudgetRon:Infinity},{candidateDates:[{date:'2099-02-30',responses:[]}]},{candidateDates:[{date:'2099-01-01',responses:[{userId:id(2),answer:'admin'}]}]}])assert.throws(()=>parsePlans([{...plan,...patch}]));
});
test('new plans contain candidate nights and no selected date or checkout',async()=>{
 const writes:Array<{path:string;body:any}>=[];
 const request:OutingsRequest=async<T>(path,method,body)=>{if(method==='POST'){writes.push({path,body});return plan as T;}return [] as T;};
 const store=new OutingsStore(request,()=>true,()=>id(8),'plans');
 await store.createPlan({title:'Friday',candidateDates:[planningToday()],decisionAt:new Date(Date.now()+3600000).toISOString(),city:'Bucuresti',friendIds:[id(3)]});
 assert.equal(writes.length,1);assert.equal(writes[0]?.path,'/outings/plans');assert.equal(writes[0]?.body.outingDate,undefined);
 await store.createPlan({title:'Friday',candidateDates:[planningToday(),planningToday()],city:'Bucuresti',friendIds:[id(3)]});assert.equal(writes.length,1);
 await store.vote(id(1),id(4),'maybe');assert.deepEqual(writes[1],{path:'/outings/plans/'+id(1)+'/vote',body:{eventId:id(4),answer:'maybe'}});
 store.dispose();
});
test('foreground watch is cancelled when its owner leaves',async()=>{
 let aborted=false;
 const request:OutingsRequest=async<T>(path,_method,_body,signal)=>{if(!path.includes('/changes'))return [] as T;return await new Promise<T>((_resolve,reject)=>signal?.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));}));};
 const store=new OutingsStore(request,()=>true,()=>id(8),'plans'),stop=store.watchPlan(id(1));stop();await Promise.resolve();assert.equal(aborted,true);store.dispose();
});
