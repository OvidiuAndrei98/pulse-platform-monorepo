import { operations, type HandledFailure } from '../../../pulse-app/src/features/diagnostics/report';

type Operation = HandledFailure['operation'];
type Sink = (error: unknown, detail: HandledFailure) => void;
let sink: Sink | undefined;
let reported = new WeakSet<object>();
export function bindHandledReporting(next: Sink | undefined) { sink = next; reported = new WeakSet(); }

// Only bounded enums leave this module: never URLs, backend messages, account
// identifiers, QR codes, Stripe errors or request/response bodies.
export function handledFailure(error: unknown, operation: Operation): HandledFailure | undefined {
  if (!operations.includes(operation)) return;
  const row = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  if (row.name === 'AbortError') return;
  if (typeof row.status === 'number' && row.status >= 400 && row.status < 500) return;
  if (typeof row.status === 'number' && Number.isInteger(row.status) && row.status >= 500 && row.status <= 599)
    return { operation, failure: 'server_error', httpStatus: row.status };
  const code = typeof row.code === 'string' ? row.code : row.message;
  if (['INVALID_RESPONSE', 'INVALID_PAYMENT_RESPONSE', 'INVALID_PAYMENT_CONFIRMATION', 'INVALID_SCANNER_RESPONSE', 'INVALID_OFFLINE_SYNC', 'INCOMPLETE_OFFLINE_SYNC'].includes(String(code)))
    return { operation, failure: 'invalid_response' };
  if (['OFFLINE_STORAGE_CORRUPT', 'PAYMENT_RECOVERY_STORAGE'].includes(String(code)))
    return { operation, failure: 'storage_error' };
  if (row.name === 'PaymentSheetFailure') {
    if (/^stripe-(initialize|present)-configuration$/.test(String(row.reference))) return { operation: 'payment_present', failure: 'configuration' };
    if (/^stripe-(initialize|present)-unavailable$/.test(String(row.reference))) return { operation: 'payment_present', failure: 'sdk_error' };
  }
  // No generic fallback: offline, timeout, cancellation, validation and declined
  // payments are expected outcomes, not evidence of a technical defect.
}
export function captureHandledFailure(error: unknown, operation: Operation) {
  if (!sink) return;
  try {
    const detail = handledFailure(error, operation);
    if (detail) reportFailure(error, detail);
  } catch { /* Even thrown objects with unsafe getters cannot break the flow. */ }
}
export function reportFailure(error: unknown, detail: HandledFailure) {
  if (!sink) return;
  try {
    if (error && typeof error === 'object') {
      if (reported.has(error)) return;
      reported.add(error);
    }
    sink(error, detail);
  } catch { /* Diagnostics must not change the operation's outcome. */ }
}
export async function observeOperation<T>(operation: Operation, task: () => Promise<T>): Promise<T> {
  try { return await task(); }
  catch (error) { captureHandledFailure(error, operation); throw error; }
}
export async function observeStorage<T>(operation: 'scanner_storage' | 'tickets_storage' | 'payment_storage', task: () => Promise<T>): Promise<T> {
  try { return await task(); }
  catch (error) { reportFailure(error, { operation, failure: 'storage_error' }); throw error; }
}
export function requestOperation(path: string): Operation | undefined {
  const route = path.split('?')[0]!;
  if (route.startsWith('/diagnostics/') || route === '/admin/client-errors') return;
  if (route === '/users/me/tickets') return 'tickets_load';
  if (route === '/users/me/orders') return 'orders_load';
  if (/\/tickets\/(purchase|book)$/.test(route)) return 'payment_prepare';
  if (route.startsWith('/checkout/')) return 'payment_confirm';
  if (route === '/dashboard/ticket-validation/events') return 'scanner_events';
  if (/\/(tickets\/validate|quick-access\/validate)$/.test(route)) return 'scanner_validate';
  if (route.endsWith('/offline-snapshot')) return 'scanner_prepare';
  if (route.endsWith('/offline-sync')) return 'scanner_sync';
  return 'api_request';
}
