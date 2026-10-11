import type { NativePaymentSession } from './nativePayment';
import type { InvoiceDetails } from '../../../pulse-app/src/features/checkout/invoiceDetails';

// Hosted Checkout remains the browser payment flow. Never bundle native Stripe on web.
export async function openNativePaymentSheet(_session: NativePaymentSession, _email: string, _details: InvoiceDetails): Promise<'completed' | 'cancelled'> {
  throw new Error('PAYMENT_SHEET_NATIVE_ONLY');
}
