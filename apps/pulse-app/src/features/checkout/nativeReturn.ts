export const NATIVE_CHECKOUT_RETURN = 'spottr-native://checkout/return';
const eventPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validCheckoutSession = (value: unknown): value is string => typeof value === 'string' && /^cs_[A-Za-z0-9_]{1,250}$/.test(value);

// Return parameters choose a screen only. Payment status always comes from the API.
export function nativeCheckoutReturn(params: URLSearchParams): string | null {
  const eventId = params.get('event_id'), sessionId = params.get('session_id');
  if (!eventId || !eventPattern.test(eventId)) return null;
  const result = new URL(NATIVE_CHECKOUT_RETURN);
  result.searchParams.set('eventId', eventId);
  if (params.get('cancelled') === '1') result.searchParams.set('cancelled', '1');
  else {
    if (!validCheckoutSession(sessionId)) return null;
    result.searchParams.set('sessionId', sessionId);
  }
  return result.href;
}
