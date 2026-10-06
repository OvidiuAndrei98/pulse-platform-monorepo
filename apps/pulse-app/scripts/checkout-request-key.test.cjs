const assert = require('node:assert/strict');
const { test } = require('node:test');
const { webcrypto } = require('node:crypto');
const { modules } = require('./helpers/qaHarness.cjs');

test('checkout retries reuse their intent while changed purchases get a new UUID', () => {
  const { checkoutRequestKey } = modules({}, { crypto: webcrypto }).load('features/checkout/requestKey');
  const first = checkoutRequestKey(null, 'one ticket');
  assert.match(first.key, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(checkoutRequestKey(first, 'one ticket'), first);
  assert.notEqual(checkoutRequestKey(first, 'two tickets').key, first.key);
});

test('API forwards idempotency, cancellation and explicit cache bypass', async () => {
  const calls = [];
  const { ApiClient } = modules({}, { fetch: async (url, options) => {
    calls.push(options); return { ok: true, status: 200, json: async () => ({}) };
  } }).load('../../../packages/api-client/src/Client.ts');
  ApiClient.configure({ apiRoot: 'https://example.invalid/api' });
  await ApiClient.instance.post('/events/{id}/tickets/purchase', {
    params: { path: { id: 'event' } }, body: {}, idempotencyKey: 'same-intent',
  });
  const controller = new AbortController();
  await ApiClient.instance.get('/events/{id}', { params: { path: { id: 'event' } }, signal: controller.signal, cache: 'no-store' });
  assert.equal(calls[0].headers['Idempotency-Key'], 'same-intent');
  assert.equal(calls[1].signal, controller.signal);
  assert.equal(calls[1].headers['Cache-Control'], 'no-cache');
});
