import assert from 'node:assert/strict';
import test from 'node:test';
import { createPaymentRecoveryStore, type StoredNativePayment } from '../src/checkout/paymentRecoveryStore';
import { acknowledgeNativePayment, clearNativePayments, configureNativePaymentRecovery, getNativePayment, getPendingNativePayment, persistNativePayment, presentAndResolveNativePayment, rememberNativePayment, resolveNativePayment, restoreNativePayments, type NativePaymentSession } from '../src/checkout/nativePayment';

const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';
const orderId = '44444444-4444-4444-8444-444444444444';
const otherOrderId = '55555555-5555-4555-8555-555555555555';
const session: NativePaymentSession = { mode: 'payment_sheet', orderId, paymentIntentId: 'pi_recovery', paymentIntentClientSecret: 'pi_recovery_secret_capability', stripeAccountId: 'acct_organizer', publishableKey: 'pk_test_public', expiresAt: '2020-01-01T00:00:00Z' };
const record = (accountId: string | null = accountA, id = orderId): StoredNativePayment => ({ session: { ...session, orderId: id }, eventId, accountId, cancelRequested: false });
function fixture() {
  const disk = new Map<string, string>();
  const faults = { read: false, write: false, remove: false };
  const kv = {
    async getItem(key: string) { if (faults.read) throw Error('locked device'); return disk.get(key) ?? null; },
    async setItem(key: string, value: string) { if (faults.write) throw Error('disk full'); disk.set(key, value); },
    async removeItem(key: string) { if (faults.remove) throw Error('locked device'); disk.delete(key); },
  };
  const store = createPaymentRecoveryStore(kv, 'https://api.test/api/v1');
  clearNativePayments(); configureNativePaymentRecovery(store);
  return { disk, faults, kv, store };
}

test('a killed process restores the same order for the same account with a new login token', async () => {
  const f = fixture();
  await restoreNativePayments(accountA, 'old-bearer');
  const original = rememberNativePayment(session, eventId, 'old-bearer');
  await persistNativePayment(original, accountA);
  clearNativePayments(); // A cold process has no JS payment map.
  const entries = await restoreNativePayments(accountA, 'new-bearer');
  assert.equal(entries.length, 1);
  const recovered = entries[0]!;
  assert.equal(recovered.status, 'pending', 'Expiry is not proof of failure');
  assert.equal(recovered.restored, true);
  assert.equal(recovered.session.orderId, orderId);
  assert.equal(getPendingNativePayment(eventId, 'new-bearer'), recovered);
  assert.equal(getPendingNativePayment(eventId, 'old-bearer'), undefined);
  assert.equal(JSON.stringify([...f.disk.values()]).includes('bearer'), false);
  await resolveNativePayment(recovered, async (_path, options) => {
    assert.equal(options.token, 'new-bearer');
    assert.equal((options.body as any).orderId, orderId);
    return { orderId, status: 'completed' };
  });
  assert.equal(recovered.status, 'completed');
  assert.equal((await f.store.load(accountA)).length, 1, 'Keep recovery until the result is acknowledged');
  await acknowledgeNativePayment(recovered);
  assert.deepEqual(await f.store.load(accountA), []);
});

test('guest recovery stays on this device and cannot be restored into an authenticated account', async () => {
  const f = fixture();
  await restoreNativePayments(null, null);
  const original = rememberNativePayment(session, eventId, null);
  await persistNativePayment(original, null);
  clearNativePayments();
  assert.deepEqual(await restoreNativePayments(accountA, 'token-A'), []);
  clearNativePayments();
  const [guest] = await restoreNativePayments(null, null);
  assert.equal(guest?.session.orderId, orderId);
  await assert.rejects(restoreNativePayments(null, 'token-A'), /PAYMENT_SESSION_CHANGED/);
  assert.equal((await f.store.load(null)).length, 1);
});

test('switching accounts and late hydration cannot leak another account payment', async () => {
  const f = fixture();
  await f.store.save(record(accountA));
  const load = f.store.load;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  configureNativePaymentRecovery({ ...f.store, load: async id => { if (id === accountA) await gate; return load(id); } });
  const old = restoreNativePayments(accountA, 'token-A');
  clearNativePayments();
  assert.deepEqual(await restoreNativePayments(accountB, 'token-B'), []);
  release();
  assert.deepEqual(await old, []);
  assert.equal(getNativePayment(orderId, eventId, 'token-A'), undefined);
  assert.equal(getNativePayment(orderId, eventId, 'token-B'), undefined);
  assert.equal((await restoreNativePayments(accountA, 'another-token-A')).length, 1);
});

test('storage hydration is single flight and failures remain retryable without discarding orders', async () => {
  const f = fixture();
  await f.store.save(record());
  f.faults.read = true;
  const first = restoreNativePayments(accountA, 'token');
  assert.equal(first, restoreNativePayments(accountA, 'token'));
  await assert.rejects(first, /PAYMENT_RECOVERY_STORAGE/);
  f.faults.read = false;
  assert.equal((await restoreNativePayments(accountA, 'token')).length, 1);
});

test('offline and invalid server responses retain the recovered order instead of permitting another purchase', async () => {
  const f = fixture(); await f.store.save(record());
  const [entry] = await restoreNativePayments(accountA, 'token');
  for (const request of [async () => { throw Error('offline'); }, async () => ({ orderId: otherOrderId, status: 'completed' }), async () => ({ orderId, status: 'paid' })]) {
    await assert.rejects(resolveNativePayment(entry!, request));
    assert.equal(getPendingNativePayment(eventId, 'token'), entry);
    await acknowledgeNativePayment(entry!);
    assert.equal((await f.store.load(accountA)).length, 1);
  }
});

test('simultaneous durable writes retain every order and only allowlisted fields', async () => {
  const f = fixture();
  const extra = { ...record(), owner: 'bearer-secret', email: 'private@example.test', session: { ...session, billing: 'private-address' } };
  await Promise.all([f.store.save(extra), f.store.save(record(accountA, otherOrderId)), f.store.save(record(accountB))]);
  assert.equal((await f.store.load(accountA)).length, 2);
  assert.equal((await f.store.load(accountB)).length, 1);
  const encoded = [...f.disk.values()].join();
  for (const privateValue of ['bearer-secret', 'private@example.test', 'private-address']) assert.equal(encoded.includes(privateValue), false);
  await f.store.remove(accountA, orderId);
  assert.deepEqual((await f.store.load(accountA)).map(row => row.session.orderId), [otherOrderId]);
  assert.equal((await f.store.load(accountB)).length, 1);
  assert.deepEqual(await createPaymentRecoveryStore(f.kv, 'https://production.test/api/v1').load(accountA), []);
});

test('storage must commit before payment presentation; a failed commit cancels through the server', async () => {
  const f = fixture(); await restoreNativePayments(accountA, 'token');
  const entry = rememberNativePayment(session, eventId, 'token');
  let presented = false, canceled = false;
  f.faults.write = true;
  const outcome = await presentAndResolveNativePayment(entry, async () => {
    await persistNativePayment(entry, accountA);
    presented = true; return 'completed';
  }, async path => { canceled = path.endsWith('/cancel'); return { orderId, status: 'failed' }; });
  assert.equal(outcome, 'failed'); assert.equal(presented, false); assert.equal(canceled, true);
});

test('an ambiguous cancellation survives restart and is rechecked, including payment winning the race', async () => {
  const f = fixture(); await restoreNativePayments(accountA, 'token');
  const entry = rememberNativePayment(session, eventId, 'token');
  await persistNativePayment(entry, accountA);
  assert.equal(await presentAndResolveNativePayment(entry, async () => 'cancelled', async () => { throw Error('timeout'); }), 'verify');
  clearNativePayments();
  const [recovered] = await restoreNativePayments(accountA, 'token2');
  assert.equal(recovered?.cancelRequested, true);
  const result = await resolveNativePayment(recovered!, async path => {
    assert.ok(path.endsWith('/cancel')); return { orderId, status: 'completed' };
  });
  assert.equal(result.status, 'completed');
  assert.equal(getPendingNativePayment(eventId, 'token2'), undefined);
});

test('a slow pending response cannot undo server-confirmed success', async () => {
  fixture(); const entry = rememberNativePayment(session, eventId, 'token');
  let release!: (result: unknown) => void;
  const slow = resolveNativePayment(entry, () => new Promise(resolve => { release = resolve; }));
  await resolveNativePayment(entry, async () => ({ orderId, status: 'completed' }));
  release({ orderId, status: 'pending' });
  assert.equal((await slow).status, 'completed');
});

test('missing, malformed and foreign recovery records fail closed and are not erased', async () => {
  for (const broken of ['missing', 'json', 'account', 'secret', 'event', 'index']) {
    const f = fixture(); await f.store.save(record());
    const entryKey = [...f.disk.keys()].find(key => key.endsWith(orderId))!;
    const indexKey = [...f.disk.keys()].find(key => key.endsWith(accountA))!;
    if (broken === 'missing') f.disk.delete(entryKey);
    if (broken === 'json') f.disk.set(entryKey, '{invalid');
    if (broken === 'account') f.disk.set(entryKey, JSON.stringify(record(accountB)));
    if (broken === 'secret') f.disk.set(entryKey, JSON.stringify({ ...record(), session: { ...session, paymentIntentClientSecret: 'wrong' } }));
    if (broken === 'event') f.disk.set(entryKey, JSON.stringify({ ...record(), eventId: 'invalid' }));
    if (broken === 'index') f.disk.set(indexKey, 'null');
    const before = [...f.disk.entries()];
    await assert.rejects(restoreNativePayments(accountA, 'token'), /PAYMENT_RECOVERY_STORAGE/);
    assert.deepEqual([...f.disk.entries()], before);
  }
});

test('account change during a durable write prevents the old checkout from presenting', async () => {
  const f = fixture(); await restoreNativePayments(accountA, 'token');
  const entry = rememberNativePayment(session, eventId, 'token');
  const write = persistNativePayment(entry, accountA);
  clearNativePayments();
  await assert.rejects(write, /PAYMENT_SESSION_CHANGED/);
  assert.equal(getPendingNativePayment(eventId, 'token'), undefined);
  assert.equal((await f.store.load(accountA)).length, 1, 'Old scope remains recoverable only by that account');
});
