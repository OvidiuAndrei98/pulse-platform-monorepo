import { ApiError } from '../data/http';
import { isEventId, type Event } from '../data/events';
import { calculateServiceFeeRon } from '../../../pulse-app/src/features/events/serviceFee';
import { discountedUnitPrice } from '../../../pulse-app/src/features/events/promoPrice';
import { isTicketSelectionAvailable } from '../../../pulse-app/src/features/checkout/ticketAvailability';
import { emptyInvoiceDetails, type InvoiceDetails } from '../../../pulse-app/src/features/checkout/invoiceDetails';
import { validCheckoutSession } from '../../../pulse-app/src/features/checkout/nativeReturn';

export type Quantities = Record<string, number>;
export type Promo = { code: string; discountPercent: number };
export type CheckoutSession = { checkoutUrl: string; orderId: string; sessionId: string };
export function parseBooking(value: unknown) {
  const row = value as { orderId?: unknown; alreadyBooked?: unknown } | null;
  if (!row || !isEventId(row.orderId) || typeof row.alreadyBooked !== 'boolean') throw new ApiError(0, 'INVALID_RESPONSE');
  return { orderId: row.orderId, alreadyBooked: row.alreadyBooked };
}
export function checkoutTotals(event: Event, quantities: Quantities, discount = 0) {
  const tickets = event.ticketTypes.filter(ticket => (quantities[ticket.id] ?? 0) > 0);
  const count = tickets.reduce((sum, ticket) => sum + quantities[ticket.id]!, 0);
  const subtotal = tickets.reduce((sum, ticket) => sum + quantities[ticket.id]! * ticket.priceRon, 0);
  const discounted = tickets.reduce((sum, ticket) => sum + quantities[ticket.id]! * discountedUnitPrice(ticket.priceRon, discount), 0);
  const fee = event.organizerAbsorbsServiceFee ? 0 : calculateServiceFeeRon(discounted, count);
  return { tickets, count, subtotal, discount: subtotal - discounted, fee, total: discounted + fee };
}
export function validSelection(event: Event, quantities: Quantities, userId?: string, now = Date.now()) {
  return event.organizerId !== userId && Date.parse(event.endTime) > now &&
    Object.values(quantities).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 8) &&
    isTicketSelectionAvailable(event.ticketTypes, quantities, now);
}
export function validPaidSelection(event: Event, quantities: Quantities, userId?: string, now = Date.now()) {
  return !event.externalTicketUrl && validSelection(event, quantities, userId, now) &&
    event.ticketTypes.filter(ticket => (quantities[ticket.id] ?? 0) > 0).every(ticket => ticket.priceRon > 0);
}
export function parsePromo(value: unknown): Promo {
  const row = value as Partial<Promo> | null;
  if (!row || typeof row.code !== 'string' || !/^[A-Z0-9_-]{3,40}$/i.test(row.code) || !Number.isInteger(row.discountPercent) || row.discountPercent! < 1 || row.discountPercent! > 100) throw new ApiError(0, 'INVALID_RESPONSE');
  return { code: row.code, discountPercent: row.discountPercent! };
}
export function parseBilling(value: unknown): InvoiceDetails | null {
  if (value == null) return null;
  const row = value as Partial<InvoiceDetails>;
  if (!row || typeof row !== 'object' || !['individual', 'company'].includes(row.type!)) throw new ApiError(0, 'INVALID_RESPONSE');
  const result = emptyInvoiceDetails();
  for (const key of Object.keys(result) as (keyof InvoiceDetails)[]) {
    if (typeof row[key] !== 'string') throw new ApiError(0, 'INVALID_RESPONSE');
    Object.assign(result, { [key]: row[key] });
  }
  return result;
}
export function parseCheckout(value: unknown, webUrl: string): CheckoutSession {
  const row = value as Partial<CheckoutSession> | null;
  if (!row || !isEventId(row.orderId) || !validCheckoutSession(row.sessionId) || typeof row.checkoutUrl !== 'string') throw new ApiError(0, 'INVALID_RESPONSE');
  let url: URL;
  try { url = new URL(row.checkoutUrl); } catch { throw new ApiError(0, 'INVALID_RESPONSE'); }
  const web = new URL(webUrl);
  const stripe = url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.port;
  const returned = url.origin === web.origin && ['/checkout/success', '/checkout/native-return'].includes(url.pathname);
  if (url.username || url.password || (!stripe && !returned)) throw new ApiError(0, 'INVALID_RESPONSE');
  return row as CheckoutSession;
}
