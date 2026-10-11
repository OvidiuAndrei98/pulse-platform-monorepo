import { dismissAuthSession, openAuthSessionAsync } from 'expo-web-browser';
import { NATIVE_CHECKOUT_RETURN } from '../../../pulse-app/src/features/checkout/nativeReturn';
let active = false;
export const paymentBrowserActive = () => active;
export function preparePaymentBrowser() {
  let opened = false;
  return { open: async (url: string, expected: { eventId: string; sessionId: string }) => {
    active = true; opened = true;
    try {
      const result = await openAuthSessionAsync(url, NATIVE_CHECKOUT_RETURN);
      if (result.type === 'success') {
        const callback = new URL(result.url), target = new URL(NATIVE_CHECKOUT_RETURN);
        if (callback.protocol !== target.protocol || callback.host !== target.host || callback.pathname !== target.pathname || callback.searchParams.get('eventId') !== expected.eventId || (callback.searchParams.get('cancelled') !== '1' && callback.searchParams.get('sessionId') !== expected.sessionId)) throw new Error('INVALID_PAYMENT_RETURN');
      }
    } finally { active = false; opened = false; }
  }, dispose: () => { if (opened) { try { dismissAuthSession(); } catch { /* Android closes its custom tab independently. */ } } } };
}
