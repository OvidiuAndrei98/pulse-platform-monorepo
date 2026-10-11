import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { initStripe, initPaymentSheet, presentPaymentSheet, handleURLCallback } from '@stripe/stripe-react-native';
import type { InvoiceDetails } from '../../../pulse-app/src/features/checkout/invoiceDetails';
import { isStripeReturnURL, type NativePaymentSession } from './nativePayment';
import { paymentSheetOptions } from './paymentSheetOptions';
import { PaymentSheetFailure } from './paymentSheetFailure';

let presenting = false;
export async function openNativePaymentSheet(session: NativePaymentSession, email: string, details: InvoiceDetails): Promise<'completed' | 'cancelled'> {
  if (presenting) throw new Error('PAYMENT_ALREADY_PRESENTING');
  presenting = true;
  const subscription = Linking.addEventListener('url', ({ url }) => {
    if (isStripeReturnURL(url)) void handleURLCallback(url).catch(() => undefined);
  });
  let phase: 'initialize' | 'present' = 'initialize';
  try {
    const extra = Constants.expoConfig?.extra;
    const merchant = typeof extra?.stripeMerchantIdentifier === 'string' ? extra.stripeMerchantIdentifier : undefined;
    // Each organizer owns a different Connect account. Always initialize its
    // exact account before initializing/presenting this order's PaymentSheet.
    await initStripe({ publishableKey: session.publishableKey, stripeAccountId: session.stripeAccountId,
      merchantIdentifier: merchant, urlScheme: 'spottr-native', setReturnUrlSchemeOnAndroid: true });
    const initialized = await initPaymentSheet(paymentSheetOptions(session, email, details,
      { applePay: !!merchant, googlePay: extra?.stripeGooglePayEnabled === true }));
    if (initialized.error) throw initialized.error;
    phase = 'present';
    const result = await presentPaymentSheet();
    if (result.error?.code === 'Canceled') return 'cancelled';
    if (result.error) throw result.error;
    return 'completed'; // UI outcome only; server reconciliation still issues tickets.
  } catch (error) {
    const failure = new PaymentSheetFailure(phase, error);
    console.warn('[checkout] Native payment unavailable', failure.reference);
    throw failure;
  } finally { subscription.remove(); presenting = false; }
}
