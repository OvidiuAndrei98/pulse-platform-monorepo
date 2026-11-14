import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticPlanRecipients,eligiblePlanRecipients,planNextAction,relevantOutingPlans } from '../src/outings/experience';
import { planningBoundary,planningToday,type OutingPlan } from '../src/outings/model';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const plan:OutingPlan={id:id(1),ownerId:id(2),title:'Test night',status:'accepted',expiresAt:'2027-01-01T00:00Z',members:[{userId:id(2),username:'Creator',status:'accepted'},{userId:id(3),username:'Member',status:'accepted'}],options:[],candidateDates:[{date:'2026-11-08',responses:[]}]};
test('personal availability and creator choice remain separate, including a two-person plan',()=>{
 assert.equal(planNextAction(plan,id(2)),'chooseNight');assert.equal(planNextAction(plan,id(3)),'yourNights');
 const answered={...plan,candidateDates:[{date:'2026-11-08',responses:[{userId:id(3),answer:'maybe' as const}]}]};
 assert.equal(planNextAction(answered,id(3)),'waiting');assert.equal(planNextAction({...answered,outingDate:'2026-11-08'},id(3)),'yourPreference');
 assert.equal(planNextAction({...plan,chosenEventId:id(4)},id(3)),'confirmed');assert.equal(planNextAction({...plan,status:'pending'},id(3)),'invited');
});
test('ownership and declined attendance never remove accepted members from the manual recipient roster',()=>{
 const group={...plan,members:[...plan.members,{userId:id(4),username:'Pending',status:'pending' as const},{userId:id(5),username:'Has ticket',status:'accepted' as const,hasTicket:true},{userId:id(6),username:'Not coming',status:'accepted' as const,arrivalStatus:'not_coming' as const},{userId:id(7),username:'Needs ticket',status:'accepted' as const,needsTicket:true}]};
 assert.deepEqual(eligiblePlanRecipients(group).map(m=>m.userId),[id(2),id(3),id(5),id(6),id(7)]);
 assert.deepEqual(eligiblePlanRecipients(group).filter(m=>m.needsTicket).map(m=>m.userId),[id(7)]);
});
test('automatic recipients require a current confirmed response and known missing admission',()=>{
 const group:OutingPlan={...plan,members:[
  {userId:id(1),username:'Coming, no ticket',status:'accepted',attendance:'yes',ticketState:'none',hasTicket:false},
  {userId:id(2),username:'Unknown',status:'accepted',attendance:'yes',ticketState:'unknown'},
  {userId:id(3),username:'Coming, pending gift',status:'accepted',attendance:'yes',ticketState:'offered',hasTicket:false},
  {userId:id(4),username:'Not coming',status:'accepted',attendance:'no',ticketState:'none',hasTicket:false},
  {userId:id(5),username:'No personal answer',status:'accepted',ticketState:'none',hasTicket:false},
 ]};
 assert.deepEqual(automaticPlanRecipients(group).map(m=>m.userId),[id(1)]);
});
test('night boundaries follow Bucharest calendar DST rather than 24 fixed hours',()=>{
 assert.equal((Date.parse(planningBoundary('2026-03-29'))-Date.parse(planningBoundary('2026-03-28')))/3600000,23);
 assert.equal((Date.parse(planningBoundary('2026-10-25'))-Date.parse(planningBoundary('2026-10-24')))/3600000,25);
 for(const [time,night] of [['2026-11-08T01:00:00+02:00','2026-11-07'],['2026-11-08T05:59:59+02:00','2026-11-07'],['2026-11-08T06:00:00+02:00','2026-11-08']])assert.equal(planningToday(new Date(time)),night);
});
test('Friends preview puts invitations first, then nearby nights without mutating the source',()=>{
 const source=[{...plan,id:id(10),outingDate:'2026-12-20'},{...plan,id:id(11),outingDate:'2026-11-07'},{...plan,id:id(12),outingDate:'2026-11-06'},{...plan,id:id(13),status:'pending' as const,outingDate:'2026-12-21'}];
 assert.deepEqual(relevantOutingPlans(source,Date.parse('2026-11-08T03:00:00+02:00')).map(p=>p.id),[id(13),id(11),id(10),id(12)]);
 assert.equal(source[0].id,id(10));
});
