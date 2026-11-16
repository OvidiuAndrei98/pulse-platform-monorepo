import './paymentRecoveryStorage';
import {useEffect,useRef,useState} from 'react';
import {Platform} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {emptyInvoiceDetails} from '@packages/app-core/checkout/invoiceDetails';
import {useAuth,accountApi} from '../auth/AuthProvider';
import {isEventId} from '../data/events';
import {queryClient} from '../data/queries';
import {WEB_URL} from '../config';
import {ApiError} from '../data/http';
import {returnToEvent} from '../navigation/returnToEvent';
import {purchaseCompletion} from './purchaseCompletion';
import {haptic} from '../ui/haptics';
import {parseRecoveredCheckout} from './recoverCheckout';
import {preparePaymentBrowser,paymentReturnOrigin} from './paymentBrowser';
import {openNativePaymentSheet} from './paymentSheet';
import {acknowledgeNativePayment,rememberNativePayment,restoreNativePayments,persistNativePayment,presentAndResolveNativePayment} from './nativePayment';
import {checkoutFailure} from './errors';

/** Resume only the buyer's existing reservation after an explicit press.
 * A prepared order is not a pending payment and never enters receipt UI. */
export function useCheckoutReservation(eventId:string){
 const {user,controller}=useAuth('account'),navigation=useNavigation<any>();
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[canCancel,setCanCancel]=useState(false),known=useRef<{orderId:string;owner:string|null}|null>(null),pending=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const completed=(orderId:string,token:string|null)=>{
  purchaseCompletion.confirm({status:'completed',orderId},eventId,token);
  for(const key of ['tickets','orders','event','event-social','event-friends','social-feed','notifications'])void queryClient.invalidateQueries({queryKey:[key]});
  haptic('success');returnToEvent(navigation,eventId);
 };
 const resume=async(orderId:string)=>{
  if(!alive.current||pending.current||!user||!isEventId(orderId)||!isEventId(eventId))return;
  const token=controller.getToken(),active=()=>alive.current&&controller.getToken()===token;
  pending.current=true;setBusy(true);setError(null);setCanCancel(false);known.current=null;
  // A browser window must be prepared synchronously with the user gesture.
  let browser:ReturnType<typeof preparePaymentBrowser>|undefined;
  try{
   if(Platform.OS==='web')browser=preparePaymentBrowser(token);
   const result=parseRecoveredCheckout(await accountApi('/checkout/recover',{method:'POST',body:{orderId,eventId},token}),orderId,WEB_URL,paymentReturnOrigin());
   if(!active())return;
   if(result.status==='completed'){
    completed(orderId,token);return;
   }
   if(result.status!=='pending'){setError('checkout.reservationExpired');return}
   if(result.paymentAttempted){navigation.navigate('CheckoutReturn',{eventId,nativeOrderId:orderId});return}
   known.current={orderId,owner:token};setCanCancel(true);
   if(result.recoveryReason){setError(result.recoveryReason==='outing_changed'?'outings.v2.destinationChanged':'outings.v2.recipientChanged');return}
   const session=result.checkout;
   if(!session){setError('checkout.paymentRecoveryUnavailable');return}
   if('mode' in session){
    if(Platform.OS==='web'){setError('checkout.resumeOnOriginalDevice');return}
    await restoreNativePayments(user.id,token);if(!active())return;
    known.current=null;setCanCancel(false);
    const entry=rememberNativePayment(session,eventId,token);
    let failure:unknown;
    const outcome=await presentAndResolveNativePayment(entry,async()=>{
     await persistNativePayment(entry,user.id);if(!active())throw new ApiError(0,'PAYMENT_SESSION_CHANGED');
     return openNativePaymentSheet(session,user.email??'',emptyInvoiceDetails(user.username??''));
    },accountApi,cause=>{failure=cause});
    if(!active())return;
    if(outcome!=='verify'){await acknowledgeNativePayment(entry).catch(()=>undefined);if(outcome==='failed')setError(checkoutFailure(failure).messageKey);return}
    navigation.navigate('CheckoutReturn',{eventId,nativeOrderId:orderId});return;
   }
   if(!browser){setError('checkout.resumeOnOriginalDevice');return}
   known.current=null;setCanCancel(false);
   await browser.open(session.checkoutUrl,{eventId,sessionId:session.sessionId});
   if(active())navigation.navigate('CheckoutReturn',{eventId,sessionId:session.sessionId});
  }catch(cause){if(active())setError(cause instanceof ApiError&&cause.status===404?'checkout.reservationExpired':checkoutFailure(cause).messageKey)}
  finally{browser?.dispose();pending.current=false;if(alive.current)setBusy(false)}
 };
 const cancel=async()=>{
  const entry=known.current,token=controller.getToken();if(!alive.current||pending.current||!entry||entry.owner!==token||!canCancel)return false;
  pending.current=true;setBusy(true);setError(null);
  try{
   const result=parseRecoveredCheckout(await accountApi('/checkout/recover',{method:'POST',body:{orderId:entry.orderId,eventId,action:'cancel'},token}),entry.orderId,WEB_URL,paymentReturnOrigin());
   if(!alive.current||controller.getToken()!==token)return false;
   if(result.status==='completed'){setCanCancel(false);known.current=null;completed(entry.orderId,token);return false}
   if(result.status==='failed'||result.status==='refunded'){setCanCancel(false);known.current=null;return true}
   setError('checkout.paymentRecoveryUnavailable');return false;
  }catch{if(alive.current&&controller.getToken()===token)setError('checkout.paymentRecoveryUnavailable');return false}
  finally{pending.current=false;if(alive.current)setBusy(false)}
 };
 return {busy,error,resume,canCancel,cancel};
}
