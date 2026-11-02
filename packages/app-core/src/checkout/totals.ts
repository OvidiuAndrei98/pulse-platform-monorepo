import { calculateServiceFeeRon, type EventCommission } from '../events/serviceFee';
import { discountedUnitPrice } from '../events/promoPrice';

type PricedTicket = { id: string; priceRon: number };
/** Same unit-price rounding and fee policy for Web and Native. The server quotes/charges independently. */
export function checkoutTotals<T extends PricedTicket>(
  event: EventCommission & { ticketTypes?: readonly T[] | null; organizerAbsorbsServiceFee?: boolean },
  quantities: Readonly<Record<string, number>>,
  discount = 0,
) {
  const tickets = (event.ticketTypes ?? []).filter(ticket => (quantities[ticket.id] ?? 0) > 0);
  const count = tickets.reduce((sum, ticket) => sum + quantities[ticket.id]!, 0);
  const subtotal = tickets.reduce((sum, ticket) => sum + quantities[ticket.id]! * ticket.priceRon, 0);
  const discounted = tickets.reduce((sum, ticket) => sum + quantities[ticket.id]! * discountedUnitPrice(ticket.priceRon, discount), 0);
  const fee = event.organizerAbsorbsServiceFee ? 0 : calculateServiceFeeRon(discounted, count, event);
  return { tickets, count, subtotal, discount: subtotal - discounted, fee, total: discounted + fee };
}
