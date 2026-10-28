import { ApiError } from '../data/http';
import { PaymentSheetFailure } from './paymentSheetFailure';

type CheckoutFailure = { messageKey: string; resetSelection: boolean };

// The API currently returns Romanian messages rather than stable error codes.
// Keep this allowlist explicit: a 409 can describe Stripe setup or an expired
// session as well as stock. Never discard tickets based on the status alone.
const unavailableSelections = new Set([
  'Nu mai exista suficiente bilete disponibile',
  'Vanzarea biletelor pentru acest eveniment este oprita',
  'Vanzarile pentru acest tip de bilet sunt inchise',
  'Evenimentul nu a fost gasit',
]);
const apiMessages = new Map([
  ['Adresa de revenire la plata nu este configurata', 'checkout.paymentNotConfigured'],
  ['Clientul de plata este invalid', 'checkout.paymentNotConfigured'],
  ['Platile nu sunt configurate', 'checkout.paymentNotConfigured'],
  ['Plata nativa nu este configurata', 'checkout.paymentNotConfigured'],
  ['Organizatorul nu poate accepta plati pentru acest eveniment', 'checkout.paymentOrganizerSetup'],
  ['Organizatorul trebuie sa configureze TVA-ul evenimentului inainte de vanzarea biletelor', 'checkout.paymentTaxSetup'],
  ['Organizatorul trebuie sa reconecteze contul Stripe inainte de a putea accepta plati', 'checkout.paymentOrganizerReconnect'],
  ['Comanda nu a putut fi pregatita', 'checkout.paymentOrderFailed'],
  ['Cererea nu a putut fi verificata. Reincearca.', 'checkout.paymentVerificationFailed'],
  ['Cererea nu a putut fi verificata', 'checkout.paymentVerificationFailed'],
  ['Sesiunea de plata Stripe nu a putut fi creata', 'checkout.paymentStripeFailed'],
  ['Sesiunea de plata Stripe nu a putut fi confirmata', 'checkout.paymentStripeFailed'],
  ['Sesiunea de plata a expirat. Reincearca.', 'checkout.paymentSessionRetry'],
  ['Sesiunea de plata nu a fost creata. Reincearca.', 'checkout.paymentSessionRetry'],
  ['Cererea de plata a fost schimbata. Reincearca.', 'checkout.paymentSessionRetry'],
  ['Nu poti cumpara bilete la propriul eveniment', 'eventPage.cannotBuyOwn'],
  ['Codul promo este invalid, expirat sau epuizat', 'checkout.promoInvalid'],
  ['Adresa de email este invalida', 'checkout.emailInvalid'],
]);

export function checkoutFailure(error: unknown): CheckoutFailure {
  const failure = (messageKey: string, resetSelection = false) => ({ messageKey, resetSelection });
  if (error instanceof PaymentSheetFailure) return failure(error.messageKey);
  if (error instanceof ApiError) {
    if (error.code === 'CHECKOUT_PRICE_CHANGED') return failure('checkout.priceChanged', true);
    if (error.code === 'PAYMENT_RECOVERY_STORAGE') return failure('checkout.paymentRecoveryUnavailable');
    if (error.code === 'PAYMENT_SESSION_CHANGED') return failure('checkout.paymentSignIn');
    if (error.status >= 400 && error.status < 500 && unavailableSelections.has(error.code)) {
      return failure('checkout.selectionUnavailable', true);
    }
    if (error.code === 'Biletele pentru acest eveniment se vand pe platforma externa a organizatorului') {
      return failure('checkout.paymentExternal', true);
    }
    const known = apiMessages.get(error.code);
    if (known) return failure(known);
    if (error.code === 'TIMEOUT' || error.status === 408 || error.status === 504) return failure('checkout.paymentTimeout');
    if (['INVALID_RESPONSE', 'INVALID_PAYMENT_RESPONSE', 'INVALID_PAYMENT_CONFIRMATION'].includes(error.code)) return failure('checkout.paymentInvalidResponse');
    if (error.status === 425) return failure('checkout.paymentPending');
    if (error.status === 429) return failure('checkout.paymentRateLimited');
    if (error.status === 401) return failure('checkout.paymentSignIn');
    if (error.status >= 500) return failure('checkout.paymentServiceUnavailable');
  }
  if (error instanceof Error && error.message === 'PAYMENT_WINDOW_BLOCKED') return failure('checkout.paymentWindowBlocked');
  if (error instanceof TypeError && /failed to fetch|fetch failed|network request failed|load failed/i.test(error.message)) {
    return failure('checkout.paymentNetworkError');
  }
  // Do not put unrecognized server/SDK text or raw responses into the UI.
  return failure('eventSheet.purchaseError');
}
