import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommissionInputs, parseCommissionSettings, commissionFormula } from '../../pulse-app/src/features/admin/commissions';
import { calculateServiceFeeRon } from '../../pulse-app/src/features/events/serviceFee';
import { normalizeEvent } from '../src/data/events';
import { checkoutFailure } from '../src/checkout/errors';
import { ApiError } from '../src/data/http';
test('commission forms accept precise decimal values and explicit zero, reject accidental zero and out of range inputs', () => {
  assert.deepEqual(parseCommissionInputs('2,25', '1.50'), { rateBps: 225, perTicketBani: 150 });
  assert.deepEqual(parseCommissionInputs('0', '0'), { rateBps: 0, perTicketBani: 0 });
  for (const text of ['', ' ', '-1', 'NaN', 'Infinity', '1e2', '1.234', '100.01']) assert.equal(parseCommissionInputs(text, '1'), null);
  assert.equal(parseCommissionInputs('4', '1000.01'), null);
});
test('preview uses the negotiated fee and the same ceiling to one ban as the server', () => {
  assert.equal(calculateServiceFeeRon(50, 1), 4);
  assert.equal(calculateServiceFeeRon(100, 2), 8);
  assert.equal(calculateServiceFeeRon(9.99, 1), 2);
  assert.equal(calculateServiceFeeRon(50, 1, { commissionRateBps: 225, commissionPerTicketBani: 100 }), 2.13);
  assert.equal(calculateServiceFeeRon(99, 3, { commissionRateBps: 225, commissionPerTicketBani: 125 }), 5.98);
  assert.equal(calculateServiceFeeRon(50, 1, { commissionRateBps: 0, commissionPerTicketBani: 0 }), 0);
  assert.equal(calculateServiceFeeRon(0, 1, { commissionRateBps: 500, commissionPerTicketBani: 150 }), 0);
});
test('event normalization retains dynamic commission values, including zero', () => {
  const event = normalizeEvent({ id: 'ea79b1ed-99b1-4000-a000-000000000001', commissionRateBps: 0, commissionPerTicketBani: 125 });
  assert.equal(event?.commissionRateBps, 0); assert.equal(event?.commissionPerTicketBani, 125);
});
test('admin response distinguishes negotiated zero from standard inheritance', () => {
  const settings = parseCommissionSettings({ standard: { rateBps: 600, perTicketBani: 300, revision: 2 }, organizers: [{ organizerId: 'ea79b1ed-99b1-4000-a000-000000000001', companyName: 'Test', email: 'test@example.invalid', override: { rateBps: 0, perTicketBani: 0 }, revision: 1 }] });
  assert.equal(commissionFormula(settings.organizers[0]!.override!, false), '0% + 0 RON / ticket');
  assert.throws(() => parseCommissionSettings({ ...settings, standard: { ...settings.standard, rateBps: -1 } }));
});
test('a stale checkout quote prompts review of updated prices without starting a payment', () => {
  assert.deepEqual(checkoutFailure(new ApiError(409, 'CHECKOUT_PRICE_CHANGED')), { messageKey: 'checkout.priceChanged', resetSelection: true });
});
