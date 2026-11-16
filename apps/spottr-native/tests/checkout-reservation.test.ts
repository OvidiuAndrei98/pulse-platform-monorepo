import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {parseRecoveredCheckout} from '../src/checkout/recoverCheckout';
const {hooks,modules,deferred,settle}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');
const plain=(value:any)=>JSON.parse(JSON.stringify(value));
const eventId='12345678-abcd-4bcd-8bcd-123456789012',orderId='12345678-abcd-4bcd-8bcd-123456789013';
const native={mode:'payment_sheet',orderId,paymentIntentId:'pi_Qa1',paymentIntentClientSecret:'pi_Qa1_secret_test',stripeAccountId:'acct_Qa1',publishableKey:'pk_test_Qa1',expiresAt:'2099-01-01T00:00:00Z'};
const hosted={orderId,sessionId:'cs_test_reference123',checkoutUrl:'https://checkout.stripe.com/c/pay/cs_test_reference123'};
const reservation={status:'pending',orderId,paymentAttempted:false,checkout:native};

test('authenticated recovery accepts only the requested order and a validated provider capability',()=>{
 assert.deepEqual(parseRecoveredCheckout(reservation,orderId,'https://spottr.ro'),reservation);
 assert.deepEqual(parseRecoveredCheckout({...reservation,checkout:hosted},orderId,'https://spottr.ro').checkout,hosted);
 for(const raw of [{...reservation,orderId:eventId},{...reservation,paymentAttempted:undefined},{...reservation,status:'paid'},{...reservation,checkout:{...native,orderId:eventId}},{...reservation,checkout:{...hosted,checkoutUrl:'https://untrusted.example/pay'}},{...reservation,checkout:'secret'}])assert.throws(()=>parseRecoveredCheckout(raw,orderId,'https://spottr.ro'));
});

function fixture({platform='ios',response=reservation,hold=false,outcome='verify',popupBlocked=false}:{platform?:string;response?:any;hold?:boolean;outcome?:string;popupBlocked?:boolean}={}){
 const h=hooks(),reply=deferred(),calls:any[]=[],navigation:any[]=[],receipts:any[]=[],sdk:any[]=[],invalidations:any[]=[],popups:any[]=[];
 let token='actor-session';
 const controller={getToken:()=>token};
 const {useCheckoutReservation}=modules({
  react:h.react,'react-native':{Platform:{OS:platform}},'@react-navigation/native':{useNavigation:()=>({navigate:(...args:any[])=>navigation.push(plain(args))})},
  '../auth/AuthProvider':{useAuth:()=>({user:{id:eventId,email:'qa@example.test',username:'QA'},controller}),accountApi:async(route:string,options:any)=>{calls.push(plain({route,options}));if(hold)await reply.promise;return response}},
  '../data/events':{isEventId:(id:any)=>typeof id==='string'&&/^[a-f\d-]{36}$/i.test(id)},'../data/queries':{queryClient:{invalidateQueries:(query:any)=>invalidations.push(query)}},'../config':{WEB_URL:'https://spottr.ro'},
  './recoverCheckout':{parseRecoveredCheckout},'./paymentRecoveryStorage':{},'./paymentBrowser':{paymentReturnOrigin:()=>undefined,preparePaymentBrowser:()=>{if(popupBlocked)throw new Error('PAYMENT_WINDOW_BLOCKED');const popup={disposed:0,opens:[] as any[],open:async(...args:any[])=>{popup.opens.push(plain(args))},dispose:()=>{popup.disposed++}};popups.push(popup);return popup}},
  './paymentSheet':{openNativePaymentSheet:async(...args:any[])=>{sdk.push(args);return 'completed'}},
  './nativePayment':{restoreNativePayments:async(...args:any[])=>calls.push({restore:args}),rememberNativePayment:(session:any,eventId:string,owner:string)=>({session,eventId,owner}),persistNativePayment:async(entry:any,actor:string)=>calls.push({persist:entry.session.orderId,actor}),presentAndResolveNativePayment:async(entry:any,present:any)=>{await present();return outcome},acknowledgeNativePayment:async(entry:any)=>calls.push({ack:entry.session.orderId})},
  './purchaseCompletion':{purchaseCompletion:{confirm:(...args:any[])=>receipts.push(plain(args))}},'../navigation/returnToEvent':{returnToEvent:(_navigation:any,id:string)=>navigation.push(['Event',id])},'../ui/haptics':{haptic:()=>{}},'./errors':{checkoutFailure:()=>({messageKey:'checkout.nativeFailed'})},
 }).load(path.resolve(__dirname,'../src/checkout/useCheckoutReservation.ts'));
 const draw=()=>h.render(()=>useCheckoutReservation(eventId));
 return{h,draw,reply,calls,navigation,receipts,sdk,invalidations,popups,changeAccount:()=>{token='other-session'},respond:(next:any)=>{response=next},allowPopup:()=>{popupBlocked=false}};
}

test('pre-Pay native recovery persists the same order before presenting and waits for server confirmation',async()=>{
 const f=fixture();await f.draw().resume(orderId);assert.equal(f.calls[0].route,'/checkout/recover');assert.deepEqual(f.calls[0].options.body,{orderId,eventId});
 assert.equal(f.sdk.length,1);assert.ok(f.calls.some((call:any)=>call.persist===orderId));assert.deepEqual(f.navigation,[['CheckoutReturn',{eventId,nativeOrderId:orderId}]]);
 assert.deepEqual(f.receipts,[],'SDK completion is not a confirmed purchase');assert.deepEqual(f.invalidations,[]);assert.equal(f.draw().error,null);f.h.unmount();
});

test('post-Pay processing never presents or creates another payment',async()=>{
 const f=fixture({response:{status:'pending',orderId,paymentAttempted:true}});await f.draw().resume(orderId);
 assert.equal(f.sdk.length,0);assert.equal(f.calls.length,1);assert.deepEqual(f.navigation,[['CheckoutReturn',{eventId,nativeOrderId:orderId}]]);assert.deepEqual(f.receipts,[]);f.h.unmount();
});

test('only authoritative completion shows a receipt, while expired reservations remain uncharged',async()=>{
 const f=fixture({response:{status:'completed',orderId,paymentAttempted:true}});await f.draw().resume(orderId);assert.equal(f.sdk.length,0);assert.deepEqual(f.receipts[0],[{status:'completed',orderId},eventId,'actor-session']);assert.deepEqual(f.navigation,[['Event',eventId]]);f.h.unmount();
 const expired=fixture({response:{status:'failed',orderId,paymentAttempted:false}});await expired.draw().resume(orderId);assert.equal(expired.draw().error,'checkout.reservationExpired');assert.deepEqual(expired.receipts,[]);assert.deepEqual(expired.sdk,[]);expired.h.unmount();
});

test('rapid repeated presses and a late response after logout cannot open a provider',async()=>{
 const f=fixture({hold:true});const first=f.draw().resume(orderId);await f.draw().resume(orderId);assert.equal(f.calls.length,1);f.changeAccount();f.reply.resolve();await first;await settle();assert.deepEqual(f.sdk,[]);assert.deepEqual(f.navigation,[]);assert.deepEqual(f.receipts,[]);f.h.unmount();
});

test('web resumes the existing hosted session and never tries to render a native PaymentSheet',async()=>{
 const f=fixture({platform:'web',response:{...reservation,checkout:hosted}});await f.draw().resume(orderId);assert.deepEqual(f.popups[0].opens,[[hosted.checkoutUrl,{eventId,sessionId:hosted.sessionId}]]);assert.equal(f.popups[0].disposed,1);assert.deepEqual(f.receipts,[]);assert.deepEqual(f.navigation,[['CheckoutReturn',{eventId,sessionId:hosted.sessionId}]]);f.h.unmount();
 const mismatch=fixture({platform:'web'});await mismatch.draw().resume(orderId);assert.equal(mismatch.draw().error,'checkout.resumeOnOriginalDevice');assert.deepEqual(mismatch.sdk,[]);assert.deepEqual(mismatch.popups[0].opens,[]);mismatch.h.unmount();
});

test('a blocked web popup releases the pending guard and permits a deliberate retry',async()=>{
 const f=fixture({platform:'web',popupBlocked:true,response:{...reservation,checkout:hosted}});
 await assert.doesNotReject(f.draw().resume(orderId));
 assert.equal(f.draw().busy,false);assert.ok(f.draw().error);assert.equal(f.calls.length,0);
 assert.deepEqual(f.navigation,[]);assert.deepEqual(f.receipts,[]);
 f.allowPopup();await f.draw().resume(orderId);
 assert.equal(f.calls[0].route,'/checkout/recover');assert.equal(f.popups[0].opens.length,1);assert.equal(f.popups[0].disposed,1);assert.equal(f.draw().busy,false);assert.equal(f.draw().error,null);
 f.h.unmount();
});

test('changed outing context cannot present a payment and closes only after an explicit cancellation',async()=>{
 const f=fixture({response:{status:'pending',orderId,paymentAttempted:false,recoveryReason:'outing_changed'}});
 assert.equal(await f.draw().cancel(),false);assert.equal(f.calls.length,0,'Cancellation is unavailable before an owned reservation was verified');
 await f.draw().resume(orderId);assert.equal(f.draw().error,'outings.v2.destinationChanged');assert.equal(f.draw().canCancel,true);assert.deepEqual(f.sdk,[]);assert.equal(f.calls.length,1,'No automatic cancellation after a context conflict');
 f.respond({status:'failed',orderId,paymentAttempted:false});assert.equal(await f.draw().cancel(),true);assert.deepEqual(f.calls.at(-1).options.body,{orderId,eventId,action:'cancel'});assert.equal(f.draw().canCancel,false);assert.deepEqual(f.receipts,[]);f.h.unmount();
});

test('a successful payment racing explicit cancellation stays a paid order',async()=>{
 const f=fixture({platform:'web'});await f.draw().resume(orderId);f.respond({status:'completed',orderId,paymentAttempted:true});assert.equal(await f.draw().cancel(),false);
 assert.equal(f.receipts.length,1);assert.deepEqual(f.navigation,[['Event',eventId]]);assert.equal(f.draw().canCancel,false);f.h.unmount();
});

test('closing the cancellation confirmation does not cancel; explicit confirmation waits for sheet dismissal',async()=>{
 const h=hooks(),calls:string[]=[],model={canCancel:true,busy:false,cancel:async()=>{calls.push('cancel');return true}};
 const {find}=require('../../pulse-app/scripts/helpers/qaHarness.cjs');
 const {CheckoutReservationActions}=modules({react:h.react,'./paymentRecoveryStorage':{},'../groups/GroupActionSheet':{GroupActionSheet:'Sheet'},'../ui/ActionButton':{ActionButton:'Button'},'../ui/Text':{Text:'Text'},'../usePreferences':{usePreferences:()=>({copy:(key:string)=>key})},'../groups/groupStyles':{groupStyles:{}}}).load(path.resolve(__dirname,'../src/checkout/CheckoutReservationActions.tsx'));
 const draw=()=>h.render(()=>CheckoutReservationActions({model,onClosed:()=>calls.push('reload')})),by=(tree:any,id:string)=>find(tree,(item:any)=>item.props?.testID===id);
 by(draw(),'checkout-close-reservation').props.onPress();let tree=draw();by(tree,'checkout-close-reservation-sheet').props.onRequestClose();tree=draw();by(tree,'checkout-close-reservation-sheet').props.onDismiss();assert.deepEqual(calls,[]);
 by(draw(),'checkout-close-reservation').props.onPress();tree=draw();const sheet=by(tree,'checkout-close-reservation-sheet');sheet.props.footer.props.onPress();tree=draw();assert.deepEqual(calls,[]);assert.equal(by(tree,'checkout-close-reservation-sheet').props.closing,true);
 by(tree,'checkout-close-reservation-sheet').props.onDismiss();await settle();assert.deepEqual(calls,['cancel','reload']);h.unmount();
});
