type Phase = 'initialize' | 'present';
export class PaymentSheetFailure extends Error {
  readonly messageKey: string;
  readonly reference: string;
  constructor(phase: Phase, error: unknown) {
    const row = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    const text = [row.code, row.stripeErrorCode, row.type, row.message, row.localizedMessage].filter(v => typeof v === 'string').join(' ');
    const reason = /network|connection|internet|offline|timed?\s*out/i.test(text) ? 'network'
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
