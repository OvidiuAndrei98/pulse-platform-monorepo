// Open synchronously from the Pay click, before awaiting the API, to avoid popup blocking.
export const paymentBrowserActive = () => false;
export function preparePaymentBrowser() {
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('PAYMENT_WINDOW_BLOCKED');
  popup.opener = null;
  popup.document.title = 'SPOTTR';
  popup.document.body.style.background = '#000';
  let timer: ReturnType<typeof setInterval> | undefined;
  let finish: (() => void) | undefined;
  return {
    open: (url: string, _expected: { eventId: string; sessionId: string }) => new Promise<void>(resolve => {
      finish = resolve;
      popup.location.replace(url);
      timer = setInterval(() => { if (popup.closed) { clearInterval(timer); resolve(); } }, 300);
    }),
    dispose: () => { clearInterval(timer); if (!popup.closed) popup.close(); finish?.(); },
  };
}
