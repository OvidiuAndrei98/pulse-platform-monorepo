"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslation} from 'react-i18next';
import {ApiClient,type ReadableSchema} from '@packages/api-client/client';
import {useDataProvider} from '@/core/DataProviderContext';
import {ActionButton} from '@/components/ui/ActionButton';
import {GroupSheet} from '@/features/groups/GroupSheet';
import s from '@/features/groups/groups.module.css';

type Props={orderId:string;eventId:string;sessionId?:string;attempted?:boolean;onResolved:()=>Promise<unknown>|void};
type Feedback='other_device'|'outing_changed'|'review_recipients'|'pending'|'unavailable';

/** Resumes only the owner's existing order. A check never creates, confirms or
 * cancels payment; closing an unpaid reservation requires a separate action. */
export function CheckoutReservationRecovery({orderId,eventId,sessionId,attempted=false,onResolved}:Props){
 const {t}=useTranslation(),router=useRouter(),auth=useDataProvider(),current=useRef(auth);current.current=auth;
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState<Feedback>(),[verifiedUnpaid,setVerifiedUnpaid]=useState(false),[cancelOpen,setCancelOpen]=useState(false),inflight=useRef<number|null>(null),scope=useRef(0);
 useEffect(()=>{scope.current++;inflight.current=null;setBusy(false);setFeedback(undefined);setVerifiedUnpaid(false);setCancelOpen(false);return()=>{scope.current++}},[orderId,eventId,auth.user?.properties.id]);
 const recover=async(action:'check'|'cancel'='check')=>{
  if(inflight.current!==null||action==='cancel'&&!verifiedUnpaid)return;const revision=scope.current,token=auth.getToken(),actor=auth.user?.properties.id;inflight.current=revision;setBusy(true);setVerifiedUnpaid(false);
  const active=()=>scope.current===revision&&current.current.getToken()===token&&current.current.user?.properties.id===actor;
  try{
   const response:ReadableSchema<'RecoverCheckoutResponse'>=await ApiClient.instance.post('/checkout/recover',{body:{orderId,eventId,action}});
   if(!active())return;
   if(response.orderId!==orderId||!['pending','completed','failed','refunded'].includes(response.status)||typeof response.paymentAttempted!=='boolean')throw Error('INVALID_CHECKOUT_RECOVERY');
   if(response.status!=='pending'){setCancelOpen(false);await onResolved();return}
   setCancelOpen(false);setVerifiedUnpaid(!response.paymentAttempted);
   if(response.recoveryReason){setFeedback(response.recoveryReason);return}
   const checkout=response.checkout;
   if(checkout&&checkout.orderId!==orderId)throw Error('CHECKOUT_ORDER_MISMATCH');
   const hosted=checkout&&'checkoutUrl' in checkout?checkout:undefined;
   const confirmedSession=hosted?.sessionId??sessionId;
   if(response.paymentAttempted){
    if(confirmedSession&&/^cs_[A-Za-z0-9_]+$/.test(confirmedSession))router.push('/checkout/success?event_id='+encodeURIComponent(eventId)+'&session_id='+encodeURIComponent(confirmedSession));
    else setFeedback('pending');
    return;
   }
   if(action==='cancel'){setFeedback('pending');return}
   if(hosted?.checkoutUrl){
    const url=new URL(hosted.checkoutUrl);
    if(url.protocol!=='https:'||url.hostname!=='checkout.stripe.com'||url.port||url.username||url.password)throw Error('INVALID_CHECKOUT_URL');
    window.location.assign(url.toString());return;
   }
   setFeedback(checkout?'other_device':'pending');
  }catch{if(active()){setFeedback('unavailable');setVerifiedUnpaid(false)}}finally{if(inflight.current===revision)inflight.current=null;if(active())setBusy(false)}
 };
 const message=feedback==='other_device'?'groups.checkoutOtherDevice':feedback==='outing_changed'?'outings.v2.destinationChanged':feedback==='review_recipients'?'outings.v2.recipientChanged':feedback==='pending'&&!verifiedUnpaid?'feedback.confirmationPendingHint':feedback==='unavailable'?'feedback.confirmationUnavailableHint':attempted?'outings.v2.existingPayment':'groups.checkoutReservationHint';
 return <div className={s.stack} style={{gap:8}} data-testid="group-checkout-recovery">
  <p className={s.muted} role={feedback==='unavailable'?'alert':'status'}>{t(message)}</p>
  <ActionButton data-testid="group-resume-checkout" busy={busy} onClick={()=>void recover()}>{t(feedback?'common.retry':attempted?'outings.v2.checkingPayment':'groups.continueCheckout')}</ActionButton>
  {!!feedback&&verifiedUnpaid&&!attempted&&<ActionButton data-testid="group-close-checkout" tone="ghost" disabled={busy} onClick={()=>setCancelOpen(true)}>{t('groups.closeCheckout')}</ActionButton>}
  {cancelOpen&&<GroupSheet testId="group-close-checkout-confirm" title={t('groups.closeCheckout')} onClose={()=>setCancelOpen(false)} busy={busy} footer={<ActionButton data-testid="group-confirm-close-checkout" busy={busy} onClick={()=>void recover('cancel')}>{t('groups.closeCheckout')}</ActionButton>}><p className={s.muted}>{t('groups.closeCheckoutHint')}</p></GroupSheet>}
 </div>;
}
