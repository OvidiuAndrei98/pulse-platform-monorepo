type Phase = 'initialize' | 'present';
export class PaymentSheetFailure extends Error {
  readonly messageKey: string;
  readonly reference: string;
  constructor(phase: Phase, error: unknown) {
    const row = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const text = [row.code, row.stripeErrorCode, row.type, row.message, row.localizedMessage].filter(v => typeof v === 'string').join(' ');
    const reason = row.code === 'Canceled' ? 'cancelled'
      : row.type === 'card_error' || typeof row.declineCode === 'string' || /card[\s_]*(?:was[\s_]*)?declin|expired[\s_]card|card[\s_](?:has[\s_])?expired|incorrect[\s_]cvc|insufficient[\s_]funds|payment_intent_authentication_failure/i.test(text) ? 'declined'
      : /network|connection|internet|offline|timed?\s*out/i.test(text) ? 'network'
      : /api.?key|authentication|permission|no such payment.?intent|resource_missing|client.?secret|account_invalid|invalid_request/i.test(text) ? 'configuration'
      : 'unavailable';
    // Never retain Stripe's raw error: it can contain a key, client secret or
    // billing details. These bounded references are safe in release builds too.
    const reference = `stripe-${phase}-${reason}`;
    super(reference);
    this.name = 'PaymentSheetFailure';
    this.reference = reference;
    this.messageKey = reason === 'network' ? 'checkout.paymentNetworkError'
      : reason === 'configuration' ? 'checkout.paymentNativeConfiguration' : 'checkout.paymentNativeUnavailable';
  }
}
