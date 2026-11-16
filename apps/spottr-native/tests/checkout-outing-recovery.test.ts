import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
const {hooks,modules,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');

const eventId='12345678-abcd-4bcd-8bcd-123456789012';
const orderId='12345678-abcd-4bcd-8bcd-123456789013';
const billing={type:'individual',name:'Buyer QA',address:'Test 1',city:'Cluj-Napoca',county:'Cluj',sector:'',country:'Romania',taxId:'',registrationNumber:''};
class Failure extends Error{constructor(readonly status:number,readonly code:string,readonly data?:unknown){super(code)}}

async function checkout(cause:unknown){
 const h=hooks(),writes:any[]=[],navigation:any[]=[],popups:any[]=[],reply=deferred();
 let token='isolated-owner',defer=false,random=0;
 const event={id:eventId,ticketTypes:[{id:'tier',priceRon:50,capacity:8,ticketsSold:0,startSales:'2020-01-01T00:00:00Z',endSales:'2099-01-01T00:00:00Z'}]};
 const controller={getToken:()=>token};
 const {useCheckoutController}=modules({
  react:h.react,'react-native':{Platform:{OS:'web'},Keyboard:{dismiss:()=>{}}},
  'expo-crypto':{getRandomBytes:(size:number)=>new Uint8Array(size).fill(++random)},
  '@react-navigation/native':{usePreventRemove:()=>{}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({bottom:0,top:0})},
  '../ui/haptics':{haptic:()=>{}},'./paymentSheet':{},'./paymentRecoveryStorage':{},'./nativePayment':{},
  '../auth/AuthProvider':{useAuth:()=>({ready:true,user:{id:'buyer',username:'Buyer QA',email:'buyer@example.test'},controller}),accountApi:async(url:string,options:any)=>{if(url==='/users/me/billing-details')return {details:null};writes.push({url,options});if(defer)await reply.promise;throw cause}},
  '../data/queries':{useEvent:()=>({data:event,isFetching:false,isError:false,refetch:async()=>{}}),queryClient:{invalidateQueries:()=>{}}},
  '../data/useEventClock':{useEventClock:()=>Date.now()},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key,language:'en'})},
  '../config':{WEB_URL:'https://example.test'},'../data/http':{ApiError:Failure},
  '../navigation/returnToEvent':{returnToEvent:()=>navigation.push(['Event'])},'./purchaseCompletion':{purchaseCompletion:{confirm:()=>{}}},
  './data':{checkoutTotals:()=>({total:54,tickets:[{id:'tier'}]}),parseBilling:()=>null,validPaidSelection:()=>true},
  './usePromoCode':{usePromoCode:()=>({code:'',validating:false})},
  './useCheckoutReservation':{useCheckoutReservation:()=>({busy:false,error:null,resume:async(id:string)=>{navigation.push(['ResumeExisting',eventId,id])}})},
  './paymentBrowser':{paymentReturnOrigin:()=> 'http://localhost:8083',preparePaymentBrowser:()=>{const popup={disposed:0,dispose(){this.disposed++}};popups.push(popup);return popup}},
  './errors':{checkoutFailure:()=>({messageKey:'checkout.paymentServiceUnavailable',resetSelection:false})},'../diagnostics/handled':{captureHandledFailure:()=>{}},
 },{__DEV__:false}).load(path.resolve(__dirname,'../src/checkout/useCheckoutController.ts'));
 const draw=()=>h.render(()=>useCheckoutController({route:{params:{eventId,quantities:{tier:1},outing:{planId:'outing',decisionRound:2,recipientIds:['buyer']}}},navigation:{setOptions:()=>{},navigate:(...args:any[])=>navigation.push(args),goBack:()=>navigation.push(['Back'])}}));
 let model=draw();await settle();model=draw();model.setDetails(billing);model=draw();assert.equal(model.blocked,false);
 return {h,draw,writes,navigation,popups,reply,defer:()=>{defer=true},changeAccount:()=>{token='another-owner'}};
}

for(const reason of ['outing_changed','additional_ticket_confirmation','pending_access','review_recipients'])test('checkout stops repeating a refused outing purchase and provides recovery: '+reason,async()=>{
 const t=await checkout(new Failure(409,'OUTING_RECIPIENTS_CHANGED',{error:'OUTING_RECIPIENTS_CHANGED',reason}));
 await t.draw().pay();let model=t.draw();assert.ok(model.outingRecovery);assert.equal(model.blocked,true);assert.equal(t.writes.length,1);assert.equal(t.popups[0].disposed,1);
 await model.pay();assert.equal(t.writes.length,1,'The old rejected selection cannot create another request');model.recoverOuting();assert.deepEqual(t.navigation,[['Back']]);t.h.unmount();
});

test('an existing payment recovers only the order explicitly returned by the API',async()=>{
 const t=await checkout(new Failure(409,'OUTING_RECIPIENTS_CHANGED',{error:'OUTING_RECIPIENTS_CHANGED',reason:'existing_payment',orderId}));
 await t.draw().pay();t.draw().recoverOuting();assert.deepEqual(JSON.parse(JSON.stringify(t.navigation)),[['ResumeExisting',eventId,orderId]]);t.h.unmount();
 const without=await checkout(new Failure(409,'OUTING_RECIPIENTS_CHANGED',{error:'OUTING_RECIPIENTS_CHANGED',reason:'existing_payment'}));
 await without.draw().pay();assert.equal(without.draw().outingRecovery.kind,'pending_access');without.draw().recoverOuting();assert.deepEqual(without.navigation,[['Back']]);without.h.unmount();
});

test('a transient service failure remains retryable with the same idempotency key',async()=>{
 const t=await checkout(new Failure(503,'HTTP_ERROR'));await t.draw().pay();let model=t.draw();assert.equal(model.outingRecovery,undefined);assert.equal(model.blocked,false);await model.pay();assert.equal(t.writes.length,2);assert.equal(t.writes[0].options.idempotencyKey,t.writes[1].options.idempotencyKey);t.h.unmount();
});

test('a delayed refusal from a previous account cannot publish recovery on the new account',async()=>{
 const t=await checkout(new Failure(409,'OUTING_RECIPIENTS_CHANGED',{error:'OUTING_RECIPIENTS_CHANGED',reason:'existing_payment',orderId}));
 t.defer();const paying=t.draw().pay();await settle();t.changeAccount();t.reply.resolve();await paying;const model=t.draw();assert.equal(model.outingRecovery,undefined);assert.equal(model.error,null);assert.deepEqual(t.navigation,[]);t.h.unmount();
});
