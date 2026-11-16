import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {outingCheckoutRecovery} from '../src/outings/experience';
import {parsePlans,type OutingPlan} from '../src/outings/model';
import {groupTicketReadiness} from '../src/social/groups';

const orderId='11111111-2222-4333-8444-555555555555';
const failure=(reason:string,extra:Record<string,unknown>={})=>({status:409,title:'Conflict',data:{error:'OUTING_RECIPIENTS_CHANGED',reason,...extra}});

test('group checkout conflict exposes distinct safe recovery without changing payment behavior',()=>{
 for(const [reason,kind] of [['review_recipients','review_selection'],['outing_changed','review_outing'],['additional_ticket_confirmation','review_extra'],['pending_access','pending_access']] as const){
  const state=outingCheckoutRecovery(failure(reason));assert.equal(state?.kind,kind);assert.ok(state?.messageKey);assert.ok(state?.actionKey);assert.equal(state?.orderId,undefined);
 }
 assert.equal(outingCheckoutRecovery({status:409,code:'OUTING_RECIPIENTS_CHANGED'})?.kind,'review_selection','older API remains supported');
 assert.equal(outingCheckoutRecovery({status:409,title:'TICKET_GIFT_WINDOW_CLOSED'})?.kind,'gift_window_closed');
 for(const cause of [undefined,new Error('network'),{status:409,code:'PRICE_CHANGED'},{status:503,data:{error:'STRIPE_UNAVAILABLE'}}])assert.equal(outingCheckoutRecovery(cause),undefined);
});

test('existing payment recovery requires a server-owned well-formed order reference',()=>{
 const own=outingCheckoutRecovery(failure('existing_payment',{orderId}));assert.equal(own?.kind,'existing_payment');assert.equal(own?.orderId,orderId);
 for(const invalid of [undefined,'','https://example.com/anything','../../orders',42]){
  const state=outingCheckoutRecovery(failure('existing_payment',{orderId:invalid}));assert.equal(state?.kind,'pending_access');assert.equal(state?.orderId,undefined);
 }
 assert.equal(outingCheckoutRecovery(failure('pending_access',{orderId}))?.orderId,undefined,'unrelated fields cannot disclose an order');
});

test('a private checkout reservation is not a submitted payment or an issued ticket',()=>{
 const plan:OutingPlan={id:orderId,ownerId:orderId,title:'Local QA',status:'accepted',expiresAt:'2030-01-01T00:00:00Z',chosenEventId:orderId,lifecycle:'event_selected',members:[{userId:orderId,username:'QA',status:'accepted',attendance:'yes',ticketState:'none',hasTicket:false}],options:[],myCheckoutReservation:{orderId,sessionId:'cs_test_original'}};
 const parsed=parsePlans([plan])[0]!;
 assert.deepEqual(parsed.myCheckoutReservation,plan.myCheckoutReservation);
 assert.equal(parsed.myPendingPayment,undefined);
 assert.equal(groupTicketReadiness(parsed,orderId).ready,0);
 assert.equal(groupTicketReadiness(parsed,orderId).ownTicketUsable,false);
 const attempted=parsePlans([{...plan,myCheckoutReservation:undefined,myPendingPayment:{orderId}}])[0]!;
 assert.deepEqual(attempted.myPendingPayment,{orderId});
 for(const invalid of [{orderId:'not-an-order'},{orderId,sessionId:'https://example.com'},{orderId,sessionId:23},null])assert.throws(()=>parsePlans([{...plan,myCheckoutReservation:invalid}]));
});
