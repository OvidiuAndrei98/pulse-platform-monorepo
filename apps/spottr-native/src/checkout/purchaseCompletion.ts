import { isEventId } from '../data/events';
import type { UserTicket } from '../data/tickets';

export type PurchaseCompletion = Readonly<{ eventId: string; orderId?: string; owner: string | null }>;

/** In-memory handoff from server reconciliation to the event. A URL, Stripe UI
 * callback or persisted screen state cannot open a successful confirmation. */
export function createPurchaseCompletionStore() {
  let current: PurchaseCompletion | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => current,
    confirm(result: { status: string; orderId?: string }, eventId: string, owner: string | null) {
      if (result.status !== 'completed' || !isEventId(eventId)) return null;
      const orderId = isEventId(result.orderId) ? result.orderId : undefined;
      if (current?.eventId === eventId && current.orderId === orderId && current.owner === owner) return current;
      current = { eventId, orderId, owner }; notify(); return current;
    },
    dismiss(receipt: PurchaseCompletion) {
      if (current !== receipt) return;
      current = null; notify();
    },
    clear() { if (current) { current = null; notify(); } },
  };
}

export const purchaseCompletion = createPurchaseCompletionStore();

export function ticketsForPurchase(tickets: UserTicket[], receipt: PurchaseCompletion) {
  // Older APIs may omit orderId. Never guess by event or open an older QR.
  if (!receipt.orderId) return [];
  return tickets.filter(ticket => ticket.orderId === receipt.orderId && ticket.eventId === receipt.eventId);
}
