// Open synchronously from the Pay click, before awaiting the API, to avoid popup blocking.
export const paymentBrowserActive = () => false;
export const paymentReturnOrigin = () => window.location.origin;
export function preparePaymentBrowser() {
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('PAYMENT_WINDOW_BLOCKED');
  popup.opener = null;
  popup.document.title = 'SPOTTR';
  popup.document.body.style.background = '#000';
  let timer: ReturnType<typeof setInterval> | undefined;
  let finish: (() => void) | undefined;
  let redirected = false;
  // The provider may return to spottr.ro rather than this localhost origin.
  // Observe returning to our tab, never inspect a cross-origin popup or trust
  // its URL as proof of payment. CheckoutReturn reconciles with the server.
  let left = !document.hasFocus() || document.visibilityState === 'hidden';
  const leave = () => { left = true; };
  const focus = () => { if (left) finish?.(); };
  const visibility = () => document.visibilityState === 'hidden' ? leave() : focus();
  const cleanup = () => {
    clearInterval(timer);
    window.removeEventListener('blur', leave);
    window.removeEventListener('focus', focus);
    document.removeEventListener('visibilitychange', visibility);
  };
  window.addEventListener('blur', leave);
  window.addEventListener('focus', focus);
  document.addEventListener('visibilitychange', visibility);
  return {
    open: (url: string, expected: { eventId: string; sessionId: string }) => new Promise<void>(resolve => {
      finish = () => { cleanup(); resolve(); };
      popup.location.replace(url);
      redirected = true;
      timer = setInterval(() => {
        if (popup.closed) { finish?.(); return; }
        try {
          const returned = new URL(popup.location.href);
          if (returned.origin === window.location.origin && returned.pathname === '/checkout/return' &&
              returned.searchParams.get('eventId') === expected.eventId &&
              (returned.searchParams.get('sessionId') === expected.sessionId || returned.searchParams.get('cancelled') === '1')) {
            popup.close();
            finish?.();
          }
        } catch { /* Stripe is cross-origin until it returns to our app. */ }
      }, 300);
      // The user can come back while the purchase request is still pending.
      if (left && document.hasFocus() && document.visibilityState !== 'hidden') finish();
    }),
    dispose: () => {
      cleanup();
      // Coming back early is not cancellation: leave the Stripe tab available.
      // Only an unused blank tab (failed preparation) belongs to our cleanup.
      if (!redirected && !popup.closed) popup.close();
      finish?.();
    },
  };
}
