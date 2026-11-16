import {ApiError} from '../data/http';
import {parseCheckout,type CheckoutSession} from './data';
import {parseNativePayment,type NativePaymentSession,type NativePaymentStatus} from './nativePayment';

export type RecoveredCheckout={status:NativePaymentStatus;orderId:string;paymentAttempted:boolean;checkout?:CheckoutSession|NativePaymentSession;recoveryReason?:'outing_changed'|'review_recipients'};

/** An authenticated recovery returns an existing capability, never a purchase.
 * Validate its order and provider URL before handing it to either presentation. */
export function parseRecoveredCheckout(value:unknown,orderId:string,webUrl:string,returnOrigin?:string):RecoveredCheckout{
 const row=value as Partial<RecoveredCheckout>|null;
 if(!row||row.orderId!==orderId||!['pending','completed','failed','refunded'].includes(row.status??'')||typeof row.paymentAttempted!=='boolean')throw new ApiError(0,'INVALID_PAYMENT_CONFIRMATION');
 if(row.recoveryReason!==undefined&&!['outing_changed','review_recipients'].includes(row.recoveryReason))throw new ApiError(0,'INVALID_PAYMENT_CONFIRMATION');
 let checkout:RecoveredCheckout['checkout'];
 if(row.status==='pending'&&row.checkout){if(typeof row.checkout!=='object')throw new ApiError(0,'INVALID_PAYMENT_CONFIRMATION');checkout='mode' in row.checkout&&row.checkout.mode==='payment_sheet'?parseNativePayment(row.checkout):parseCheckout(row.checkout,webUrl,returnOrigin);if(checkout.orderId!==orderId)throw new ApiError(0,'INVALID_PAYMENT_CONFIRMATION')}
 return {status:row.status!,orderId,paymentAttempted:row.paymentAttempted,...(checkout?{checkout}:{}),...(row.recoveryReason?{recoveryReason:row.recoveryReason}:{})};
}
