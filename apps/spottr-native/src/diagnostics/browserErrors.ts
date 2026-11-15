type BrowserError = Pick<ErrorEvent, 'error' | 'message' | 'filename' | 'lineno' | 'colno'>;
type Capture = (error: unknown, fatal?: boolean) => void;

/** Preserve a browser's actual source location when ErrorEvent.error is null.
 * Raw event text and URLs remain local and pass through reportError's existing
 * sanitizer; no synthetic reporter call site is substituted for the source.
 */
export function browserErrorValue(event: BrowserError): unknown {
  if (event.error && typeof event.error === 'object') return event.error;
  const message = typeof event.error === 'string' ? event.error
    : typeof event.message === 'string' ? event.message : '';
  const source = typeof event.filename === 'string' && event.filename.length <= 4096
    && !/[\r\n]/.test(event.filename) && event.filename.length > 0
    && Number.isInteger(event.lineno) && event.lineno > 0 && event.lineno <= 100000000
    && Number.isInteger(event.colno) && event.colno >= 0 && event.colno <= 100000000;
  return { name: 'Error', message, ...(source ? {
    stack: `Error${message ? ': ' + message : ''}\n    at ${event.filename}:${event.lineno}:${event.colno}`,
  } : {}) };
}

export function installBrowserErrorReporting(target: Pick<Window, 'addEventListener'>, capture: Capture) {
  target.addEventListener('error', event => capture(browserErrorValue(event), true));
  target.addEventListener('unhandledrejection', event => {
    // A thrown string has no stack. Classify it without inventing a call site;
    // only the fixed diagnostic vocabulary survives the downstream sanitizer.
    capture(typeof event.reason === 'string' ? { name: 'Error', message: event.reason } : event.reason);
  });
}
