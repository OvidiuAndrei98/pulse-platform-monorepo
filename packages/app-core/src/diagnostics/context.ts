// Public diagnostic vocabulary, never a container for arbitrary error strings.
// Release the API schema first: older API versions reject unknown JSON fields.
export const diagnosticMessages = {
  HTTP_SERVER_ERROR: 'The server could not complete the request.',
  HTTP_SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
  HTTP_GATEWAY_TIMEOUT: 'The gateway timed out waiting for the service.',
  HTTP_BAD_GATEWAY: 'The gateway received an invalid response from the service.',
  DATABASE_ERROR: 'The server reported a database operation failure.',
  AUTH_UNAVAILABLE: 'The server could not verify the current account session.',
  INVALID_RESPONSE: 'The response did not match the expected application format.',
  STORAGE_ERROR: 'Local application data could not be read or saved.',
  SDK_ERROR: 'The payment SDK could not complete its operation.',
  CONFIGURATION_ERROR: 'The payment SDK configuration is unavailable or invalid.',
  FULFILLMENT_MISSING: 'Payment was confirmed but the refreshed ticket was missing.',
  JS_PROPERTY_ACCESS: 'JavaScript attempted to access a property on a missing value.',
  JS_UNDEFINED_IDENTIFIER: 'JavaScript referenced an undefined identifier.',
  JS_INVALID_HOOK: 'React detected an invalid hook call or hook order.',
  JS_RENDER_ERROR: 'The application could not render this screen.',
  NETWORK_ERROR: 'The application could not reach the service.',
  TIMEOUT: 'The operation exceeded its time limit.',
  UNEXPECTED_ERROR: 'An unexpected application error occurred. Check the stack frames.',
} as const;
export type DiagnosticCode = keyof typeof diagnosticMessages;
export type DiagnosticSource = 'javascript' | 'api' | 'http' | 'storage' | 'payment_sdk' | 'fulfillment' | 'network';
export function diagnosticSource(code: DiagnosticCode): DiagnosticSource {
  if (code === 'DATABASE_ERROR' || code === 'AUTH_UNAVAILABLE') return 'api';
  if (code.startsWith('HTTP_') || code === 'INVALID_RESPONSE') return 'http';
  if (code === 'STORAGE_ERROR') return 'storage';
  if (code === 'SDK_ERROR' || code === 'CONFIGURATION_ERROR') return 'payment_sdk';
  if (code === 'FULFILLMENT_MISSING') return 'fulfillment';
  if (code === 'NETWORK_ERROR' || code === 'TIMEOUT') return 'network';
  return 'javascript';
}
export const diagnosticEndpoints = ['tickets', 'orders', 'events', 'event', 'event_social', 'event_friends', 'feed', 'notifications', 'friends', 'profile', 'dashboard', 'checkout', 'scanner', 'other'] as const;
export const diagnosticMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type DiagnosticContext = {
  errorCode?: DiagnosticCode;
  safeMessage?: string;
  errorSource?: DiagnosticSource;
  endpoint?: (typeof diagnosticEndpoints)[number];
  httpMethod?: (typeof diagnosticMethods)[number];
  requestId?: string;
};
export const isDiagnosticCode = (value: unknown): value is DiagnosticCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(diagnosticMessages, value);
export const safeRequestId = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value) ? value : undefined;

// Unknown paths never leave the device, even after removing query strings.
export function diagnosticEndpoint(path: string): NonNullable<DiagnosticContext['endpoint']> {
  const route = path.split('?')[0]!;
  if (/[#%]/.test(route)) return 'other';
  const exact: Record<string, NonNullable<DiagnosticContext['endpoint']>> = {
    '/users/me/tickets': 'tickets', '/users/me/orders': 'orders', '/events': 'events',
    '/feed': 'feed', '/notifications': 'notifications', '/friends': 'friends', '/users/me': 'profile',
    '/checkout/reconcile': 'checkout', '/checkout/cancel': 'checkout',
    '/dashboard/ticket-validation/events': 'scanner',
  };
  if (Object.prototype.hasOwnProperty.call(exact, route)) return exact[route]!;
  const event = route.match(/^\/events\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(\/social|\/friends|\/tickets\/purchase|\/tickets\/book)?$/i);
  if (event) return event[1] === '/social' ? 'event_social' : event[1] === '/friends' ? 'event_friends' : event[1] ? 'checkout' : 'event';
  return 'other';
}

export function httpDiagnostic(path: string, method: string, status: number, requestId: unknown, backendCode: unknown): DiagnosticContext {
  // Only API-owned, fixed codes are recognized, never row.error or row.message.
  const errorCode: DiagnosticCode = backendCode === 'DATABASE_ERROR' || backendCode === 'AUTH_UNAVAILABLE'
    ? backendCode : status === 503 ? 'HTTP_SERVICE_UNAVAILABLE' : status === 504 ? 'HTTP_GATEWAY_TIMEOUT'
      : status === 502 ? 'HTTP_BAD_GATEWAY' : 'HTTP_SERVER_ERROR';
  return { errorCode, safeMessage: diagnosticMessages[errorCode], errorSource: safeRequestId(requestId) ? 'api' : diagnosticSource(errorCode),
    ...(diagnosticMethods.includes(method as never) ? { endpoint: diagnosticEndpoint(path), httpMethod: method as DiagnosticContext['httpMethod'] } : {}),
    ...(safeRequestId(requestId) ? { requestId: safeRequestId(requestId) } : {}) };
}

export function parseDiagnosticContext(value: unknown): DiagnosticContext {
  if (!value || typeof value !== 'object') throw Error('INVALID_DIAGNOSTIC');
  const row = value as DiagnosticContext & { httpStatus?: number; failure?: string; category?: string };
  const hasCode = row.errorCode !== undefined || row.safeMessage !== undefined || row.errorSource !== undefined;
  if (hasCode && (!isDiagnosticCode(row.errorCode) || row.safeMessage !== diagnosticMessages[row.errorCode])) throw Error('INVALID_DIAGNOSTIC');
  if (hasCode && (row.errorSource !== diagnosticSource(row.errorCode!) && !(row.errorSource === 'api' && (row.errorCode!.startsWith('HTTP_') || row.errorCode === 'INVALID_RESPONSE')))) throw Error('INVALID_DIAGNOSTIC');
  if (hasCode) {
    const failures: Record<string, string> = { invalid_response: 'INVALID_RESPONSE', storage_error: 'STORAGE_ERROR', sdk_error: 'SDK_ERROR', configuration: 'CONFIGURATION_ERROR', fulfillment_missing: 'FULFILLMENT_MISSING' };
    const categories: Record<string, string> = { property_access: 'JS_PROPERTY_ACCESS', undefined_identifier: 'JS_UNDEFINED_IDENTIFIER', invalid_hook: 'JS_INVALID_HOOK', render_exception: 'JS_RENDER_ERROR', network: 'NETWORK_ERROR', timeout: 'TIMEOUT', unknown: 'UNEXPECTED_ERROR' };
    if (row.failure === 'server_error') {
      const expected = row.httpStatus === 503 ? 'HTTP_SERVICE_UNAVAILABLE' : row.httpStatus === 502 ? 'HTTP_BAD_GATEWAY' : row.httpStatus === 504 ? 'HTTP_GATEWAY_TIMEOUT' : 'HTTP_SERVER_ERROR';
      if (!Number.isInteger(row.httpStatus) || row.httpStatus! < 500 || row.httpStatus! > 599 || ![expected, 'DATABASE_ERROR', 'AUTH_UNAVAILABLE'].includes(row.errorCode!)) throw Error('INVALID_DIAGNOSTIC');
    } else if (row.failure ? failures[row.failure] !== row.errorCode || row.httpStatus !== undefined : categories[row.category ?? ''] !== row.errorCode || row.httpStatus !== undefined) throw Error('INVALID_DIAGNOSTIC');
  }
  const hasRequest = row.endpoint !== undefined || row.httpMethod !== undefined || row.requestId !== undefined;
  if (hasRequest && (!hasCode || row.failure !== 'server_error' || !['api', 'http'].includes(row.errorSource!) || !Number.isInteger(row.httpStatus) || row.httpStatus! < 500 || row.httpStatus! > 599 || !diagnosticEndpoints.includes(row.endpoint as never) || !diagnosticMethods.includes(row.httpMethod as never)
    || row.requestId !== undefined && !safeRequestId(row.requestId))) throw Error('INVALID_DIAGNOSTIC');
  return { ...(hasCode ? { errorCode: row.errorCode, safeMessage: row.safeMessage, errorSource: row.errorSource } : {}),
    ...(hasRequest ? { endpoint: row.endpoint, httpMethod: row.httpMethod, ...(row.requestId !== undefined ? { requestId: row.requestId } : {}) } : {}) };
}
