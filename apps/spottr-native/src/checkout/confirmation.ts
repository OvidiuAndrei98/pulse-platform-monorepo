import { checkPaymentConfirmation } from '../../../pulse-app/src/features/checkout/confirmation';
import { ApiError } from '../data/http';
import { isEventId } from '../data/events';

export type PaymentResult = 'pending' | 'unavailable' | 'completed' | 'failed' | 'refunded' | 'missing';
export type PaymentConfirmation = { status: PaymentResult; orderId?: string };

/** Reuse the bounded confirmation polling, preserving refunds and missing records. */
export async function confirmPayment(
  read: () => Promise<unknown>,
  active: () => boolean,
  pause?: (ms: number) => Promise<void>,
  attempts: 1 | 4 = 4,
): Promise<PaymentConfirmation | null> {
  let terminal: PaymentResult = 'failed', orderId: string | undefined;
  const status = await checkPaymentConfirmation(async () => {
    try {
      const response = await read() as { status?: unknown; orderId?: unknown } | null;
      if (!response || typeof response.status !== 'string' || !['pending', 'completed', 'failed', 'refunded'].includes(response.status)) {
        throw new ApiError(0, 'INVALID_PAYMENT_CONFIRMATION');
      }
      if (isEventId(response.orderId)) orderId = response.orderId;
      if (response.status === 'refunded') terminal = 'refunded';
      return { status: response.status };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        terminal = 'missing';
        return { status: 'failed' }; // End polling; absence is not a failed charge.
      }
      throw error;
    }
  }, active, pause, attempts);
  return status ? { status: status === 'failed' ? terminal : status, orderId } : null;
}

export function canRecheckPayment(status: string, used: boolean) {
  return !used && (status === 'pending' || status === 'unavailable');
}

export function canRestartCheckout(status: string) {
  // A timeout, missing record or pending status never authorizes a new charge.
  return status === 'failed' || status === 'cancelled' || status === 'refunded';
}
