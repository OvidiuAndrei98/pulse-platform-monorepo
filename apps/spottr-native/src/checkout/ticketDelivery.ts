import type { UserTicket } from '../data/tickets';
import type { PurchaseCompletion } from './purchaseCompletion';
import { ticketsForPurchase } from './purchaseCompletion';
import { reportFailure } from '../diagnostics/handled';

/** Called only after a fresh, successful ticket response. Recheck the order so
 * cancelled/refunded orders and stale/offline data do not become false alerts. */
export async function verifyTicketDelivery(receipt: PurchaseCompletion, tickets: UserTicket[],
  readOrders: () => Promise<unknown>, current: () => boolean) {
  if (!receipt.owner || !receipt.orderId || !current() || ticketsForPurchase(tickets, receipt).length) return;
  try {
    const orders = await readOrders();
    if (!current() || !Array.isArray(orders)) return;
    const order = orders.find(row => row && row.id === receipt.orderId && row.eventId === receipt.eventId);
    if (order?.status !== 'completed' || order.refundedAmountBani !== 0 || !['none', ''].includes(order.stripeRefundStatus)) return;
    reportFailure(undefined, { operation: 'payment_ticket_delivery', failure: 'fulfillment_missing' });
  } catch { /* The HTTP layer reports technical failures; never change checkout. */ }
}
