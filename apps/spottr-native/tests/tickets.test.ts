import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTickets, ticketStatus, type UserTicket } from '../src/data/tickets';
import { ApiError } from '../src/data/http';
import { initialGroupTicket } from '../src/profile/ticketGroups';

function ticket(overrides: Partial<UserTicket> = {}): UserTicket {
  return {
    id: '12345678-abcd-abcd-abcd-000000000001',
    eventId: '12345678-abcd-abcd-abcd-000000000002',
    validationHash: 'signed-admission-token', isValidated: false,
    ticketTypeName: 'General admission', eventTitle: 'Concert București',
    locationName: 'Sala Palatului',
    startTime: '2026-10-07T18:00:00Z', endTime: '2026-10-08T01:00:00Z',
    priceRon: 125, ticketPriceBani: 12500, ticketingFeeBani: 250, paidTotalBani: 12750,
    organizerCompanyName: 'Example SRL', organizerCui: 'RO123456', organizerFiscalAddress: 'București',
    ...overrides,
  };
}
const invalid = (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE';

test('group opening prefers an unused admission in the same event, while explicit history selection stays intact', () => {
  const used = ticket({ isValidated: true }), active = ticket({ id: 'second' });
  const unrelated = ticket({ id: 'other', eventId: 'other-event' });
  const now = Date.parse(used.startTime);
  assert.equal(initialGroupTicket([unrelated, used, active], used.id, true, now), active.id);
  assert.equal(initialGroupTicket([used, active], used.id, false, now), used.id);
  assert.equal(initialGroupTicket([used], used.id, true, now), used.id);
  assert.equal(initialGroupTicket([used, active], used.id, true, Date.parse(used.endTime)), used.id);
  assert.equal(initialGroupTicket([], used.id, true, now), used.id);
});

test('null and empty ticket collections are valid empty responses', () => {
  assert.deepEqual(parseTickets(null), []);
  assert.deepEqual(parseTickets([]), []);
});

test('non-array ticket responses are rejected as invalid API responses', () => {
  for (const value of [undefined, {}, '[]', 0, false, { tickets: [ticket()] }]) {
    assert.throws(() => parseTickets(value), invalid);
  }
});

test('malformed rows are rejected before profile or QR rendering', () => {
  for (const row of [null, undefined, {}, [], 1, true, 'ticket']) {
    assert.throws(() => parseTickets([row]), invalid);
  }
  assert.throws(() => parseTickets([ticket(), null]), invalid, 'a mixed response must not hide failed validation');
});

test('ticket identity, QR token, labels and dates require nonempty strings', () => {
  for (const key of ['id', 'eventId', 'validationHash', 'ticketTypeName', 'eventTitle', 'locationName', 'startTime', 'endTime']) {
    for (const value of [undefined, null, '', ' \t\n', 123, {}, []]) {
      assert.throws(() => parseTickets([{ ...ticket(), [key]: value }]), invalid, `${key} must reject ${String(value)}`);
    }
  }
});

test('validation state accepts only booleans', () => {
  for (const value of [undefined, null, 'false', 'true', 0, 1]) {
    assert.throws(() => parseTickets([{ ...ticket(), isValidated: value }]), invalid);
  }
  assert.equal(parseTickets([ticket({ isValidated: false })])[0]!.isValidated, false);
  assert.equal(parseTickets([ticket({ isValidated: true })])[0]!.isValidated, true);
});

test('invalid dates cannot silently classify a malformed ticket as active', () => {
  for (const key of ['startTime', 'endTime']) {
    for (const value of ['not-a-date', '2026-13-01T00:00:00Z', '2026-10-07T99:00:00Z']) {
      assert.throws(() => parseTickets([{ ...ticket(), [key]: value }]), invalid);
    }
  }
});

test('optional amounts reject negatives, non-numbers and non-finite values', () => {
  for (const key of ['ticketPriceBani', 'ticketingFeeBani', 'paidTotalBani', 'priceRon', 'vatAmountBani', 'vatPercentage']) {
    for (const value of [-1, NaN, Infinity, -Infinity, '100', null, true]) {
      assert.throws(() => parseTickets([{ ...ticket(), [key]: value }]), invalid, `${key} must reject ${String(value)}`);
    }
    assert.equal(parseTickets([{ ...ticket(), [key]: 0 }]).length, 1, `${key} must accept a free or zero-tax ticket`);
  }
});

test('legacy missing amounts remain available for the PDF fallback', () => {
  const legacy: Record<string, unknown> = { ...ticket() };
  for (const key of ['ticketPriceBani', 'ticketingFeeBani', 'paidTotalBani', 'vatAmountBani', 'vatPercentage']) delete legacy[key];
  assert.equal(parseTickets([legacy])[0]!.priceRon, 125);
  delete legacy.priceRon;
  assert.equal(parseTickets([legacy]).length, 1);
});

test('normalization preserves admission credentials and optional fiscal metadata without mutating input', () => {
  const row = Object.freeze(ticket({ validationHash: 'CaseSensitive+/= Token', vatPercentage: 9.5, vatAmountBani: 119, validatedAt: '2026-10-07T20:00:00Z' }));
  const input = Object.freeze([row]);
  const before = JSON.stringify(input);
  const result = parseTickets(input);
  assert.deepEqual(result, [row]);
  assert.equal(result[0]!.validationHash, 'CaseSensitive+/= Token');
  assert.equal(JSON.stringify(input), before);
});

test('duplicate ticket IDs keep the first row and preserve server ordering', () => {
  const first = ticket(), second = ticket({ id: '12345678-abcd-abcd-abcd-000000000003' });
  const duplicate = ticket({ ticketTypeName: 'Conflicting duplicate' });
  assert.deepEqual(parseTickets([first, second, duplicate, second]), [first, second]);
});

test('an invalid duplicate is still rejected instead of bypassing validation', () => {
  assert.throws(() => parseTickets([ticket(), { ...ticket(), validationHash: null }]), invalid);
});

test('tickets expire exactly at event end, independently of whether the event has started', () => {
  const row = ticket(), end = Date.parse(row.endTime);
  assert.equal(ticketStatus(row, Date.parse(row.startTime) - 1), 'active');
  assert.equal(ticketStatus(row, end - 1), 'active');
  assert.equal(ticketStatus(row, end), 'expired');
  assert.equal(ticketStatus(row, end + 1), 'expired');
});

test('used status takes precedence over event expiry', () => {
  const row = ticket({ isValidated: true });
  assert.equal(ticketStatus(row, Date.parse(row.startTime) - 1), 'used');
  assert.equal(ticketStatus(row, Date.parse(row.endTime) + 1), 'used');
});

test('ticket status compares timestamps correctly across explicit timezone offsets', () => {
  const row = ticket({ endTime: '2026-10-08T04:00:00+03:00' });
  assert.equal(ticketStatus(row, Date.parse('2026-10-08T00:59:59Z')), 'active');
  assert.equal(ticketStatus(row, Date.parse('2026-10-08T01:00:00Z')), 'expired');
});

test('status defensively treats invalid end dates as expired unless already used', () => {
  assert.equal(ticketStatus(ticket({ endTime: 'invalid' }), 0), 'expired');
  assert.equal(ticketStatus(ticket({ endTime: '', isValidated: true }), 0), 'used');
});
