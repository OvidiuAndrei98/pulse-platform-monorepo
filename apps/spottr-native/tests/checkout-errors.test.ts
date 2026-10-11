import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../src/data/http';
import { checkoutFailure } from '../src/checkout/errors';
import { productCopy } from '../src/copy';

test('organizer configuration conflicts preserve tickets and explain the actual problem', () => {
  for (const [message, key] of [
    ['Organizatorul nu poate accepta plati pentru acest eveniment', 'checkout.paymentOrganizerSetup'],
    ['Organizatorul trebuie sa configureze TVA-ul evenimentului inainte de vanzarea biletelor', 'checkout.paymentTaxSetup'],
    ['Organizatorul trebuie sa reconecteze contul Stripe inainte de a putea accepta plati', 'checkout.paymentOrganizerReconnect'],
    ['Sesiunea de plata a expirat. Reincearca.', 'checkout.paymentSessionRetry'],
    ['Sesiunea de plata nu a fost creata. Reincearca.', 'checkout.paymentSessionRetry'],
  ]) {
    assert.deepEqual(checkoutFailure(new ApiError(409, message!)), { messageKey: key, resetSelection: false });
  }
  assert.equal(checkoutFailure(new ApiError(409, 'unknown conflict')).resetSelection, false);
});

test('only confirmed stock or sales changes invalidate a selection', () => {
  for (const [status, message] of [
    [409, 'Nu mai exista suficiente bilete disponibile'],
    [409, 'Vanzarea biletelor pentru acest eveniment este oprita'],
    [400, 'Vanzarile pentru acest tip de bilet sunt inchise'],
    [404, 'Evenimentul nu a fost gasit'],
  ] as const) {
    assert.deepEqual(checkoutFailure(new ApiError(status, message)), { messageKey: 'checkout.selectionUnavailable', resetSelection: true });
  }
  assert.deepEqual(checkoutFailure(new ApiError(409, 'Biletele pentru acest eveniment se vand pe platforma externa a organizatorului')), { messageKey: 'checkout.paymentExternal', resetSelection: true });
});

test('payment failures distinguish popup, network, timeouts, server and response errors in both languages', () => {
  const cases: [unknown, string][] = [
    [new Error('PAYMENT_WINDOW_BLOCKED'), 'paymentWindowBlocked'],
    [new TypeError('Failed to fetch'), 'paymentNetworkError'],
    [new TypeError('Network request failed'), 'paymentNetworkError'],
    [new TypeError('Load failed'), 'paymentNetworkError'],
    [new ApiError(0, 'TIMEOUT'), 'paymentTimeout'],
    [new ApiError(408, 'HTTP_ERROR'), 'paymentTimeout'],
    [new ApiError(504, 'API request timed out.'), 'paymentTimeout'],
    [new ApiError(0, 'INVALID_RESPONSE'), 'paymentInvalidResponse'],
    [new ApiError(0, 'INVALID_PAYMENT_RESPONSE'), 'paymentInvalidResponse'],
    [new ApiError(425, 'pending'), 'paymentPending'],
    [new ApiError(429, 'rate limit'), 'paymentRateLimited'],
    [new ApiError(401, 'expired'), 'paymentSignIn'],
    [new ApiError(500, 'unknown internal failure'), 'paymentServiceUnavailable'],
    [new ApiError(503, 'Platile nu sunt configurate'), 'paymentNotConfigured'],
    [new ApiError(503, 'Plata nativa nu este configurata'), 'paymentNotConfigured'],
    [new ApiError(503, 'Cererea nu a putut fi verificata. Reincearca.'), 'paymentVerificationFailed'],
    [new ApiError(500, 'Comanda nu a putut fi pregatita'), 'paymentOrderFailed'],
    [new ApiError(502, 'Sesiunea de plata Stripe nu a putut fi creata'), 'paymentStripeFailed'],
  ];
  for (const [error, key] of cases) {
    const result = checkoutFailure(error);
    assert.deepEqual(result, { messageKey: 'checkout.' + key, resetSelection: false });
    for (const language of ['ro', 'en'] as const) assert.notEqual(productCopy(language, result.messageKey), result.messageKey);
  }
});

test('unexpected errors never expose raw messages or clear valid tickets', () => {
  for (const error of [null, undefined, '', {}, new Error('internal details'), new TypeError('programming error'), new ApiError(409, '<html>private details</html>')]) {
    assert.deepEqual(checkoutFailure(error), { messageKey: 'eventSheet.purchaseError', resetSelection: false });
  }
});
