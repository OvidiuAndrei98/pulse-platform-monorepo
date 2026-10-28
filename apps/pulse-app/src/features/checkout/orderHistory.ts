type OrderSummary = { status: string; invoiceRequested: boolean; orderTotalBani?: number; paidTotalBani: number };

export function isVisibleTransaction(order: { status: string; paymentAttemptedAt?: string }) {
  return isConfirmedPurchase(order) || (typeof order.paymentAttemptedAt === 'string' && Number.isFinite(Date.parse(order.paymentAttemptedAt)));
}

/** Creating a checkout / PaymentIntent only reserves tickets. Neither a quoted
 * amount nor an invoice request proves that the purchase was completed. */
export function isConfirmedPurchase(order: Pick<OrderSummary, 'status'>) {
  return order.status === 'completed' || order.status === 'refunded';
}

export function isInvoiceOrder(order: Pick<OrderSummary, 'status' | 'invoiceRequested'>) {
  return order.invoiceRequested === true && isConfirmedPurchase(order);
}

export function orderTotalBani(order: Pick<OrderSummary, 'orderTotalBani' | 'paidTotalBani'>) {
  // Older APIs exposed the quoted total under paidTotalBani, even before payment.
  // Keep rolling upgrades readable; status remains the authority for invoices.
  return order.orderTotalBani ?? order.paidTotalBani;
}

export function orderStatusKey(status: string) {
  switch (status) {
    case 'completed': return 'orders.completed';
    case 'refunded': return 'orders.refunded';
    case 'failed': return 'orders.failed';
    case 'canceled': return 'orders.canceled';
    default: return 'orders.unconfirmed';
  }
}

export function invoiceStatusKey(status?: string) {
  if (status === 'dispatching') return 'processing';
  return status && ['pending', 'processing', 'issued', 'failed', 'needs_review'].includes(status) ? status : 'pending';
}
