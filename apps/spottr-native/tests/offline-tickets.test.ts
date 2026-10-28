import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { createTicketCache, type SavedTickets } from '../src/data/ticketCache';
import { canUseSavedTickets, ticketQueryOptions } from '../src/data/ticketQuery';
import { ApiError } from '../src/data/http';
import { ticketStatus, type UserTicket } from '../src/data/tickets';
import { SessionController, type Account } from '../src/auth/session';

const id = (n: number) => `12345678-abcd-abcd-abcd-${String(n).padStart(12, '0')}`;
const user = id(1), other = id(2);
const ticket = (overrides: Partial<UserTicket> = {}): UserTicket => ({
  id: id(3), eventId: id(4), orderId: id(5), validationHash: 'CaseSensitive+/=QR', isValidated: false,
  ticketTypeName: 'General', eventTitle: 'Noapte în București 🎉', locationName: 'Club',
  startTime: '2026-10-12T18:00:00Z', endTime: '2026-10-13T06:00:00Z', priceRon: 50,
  ticketPriceBani: 5000, ticketingFeeBani: 450, paidTotalBani: 5450,
  organizerCompanyName: 'Company', organizerCui: 'RO1234', organizerFiscalAddress: 'București', ...overrides,
});
const snapshot = (tickets = [ticket()], accountId = user): SavedTickets => ({ accountId, savedAt: Date.now(), tickets });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; }
function fixture() {
  const disk = new Map<string, string>(); let sequence = 10, fail = false;
  const storage = {
    getItem: async (key: string) => disk.get(key) ?? null,
    setItem: async (key: string, value: string) => { if (fail) throw Error('DISK_FULL'); disk.set(key, value); },
    removeItem: async (key: string) => { disk.delete(key); },
  };
  const create = (origin = 'staging') => createTicketCache(storage, origin, () => id(sequence++));
  return { disk, storage, create, cache: create(), fail: (value: boolean) => fail = value };
}

test('native ticket cache survives process restart, preserves exact QR and PDF fields, and isolates API/account', async () => {
  const f = fixture(), row = snapshot();
  await f.cache.save(row, () => true);
  assert.deepEqual(await f.create().load(user), row);
  assert.equal(await f.create().load(other), null);
  assert.equal(await f.create('production').load(user), null);
  await assert.rejects(f.cache.load('../foreign'));
});

test('long multilingual tickets use small UTF-8 secure items and allowlist only ticket fields', async () => {
  const f = fixture(), row = ticket({ eventTitle: '🎉 București '.repeat(1000) });
  await f.cache.save(snapshot([{ ...row, token: 'never-store-me', email: 'private@example.test' } as UserTicket]), () => true);
  assert.ok(f.disk.size > 10);
  for (const value of f.disk.values()) {
    assert.ok(new TextEncoder().encode(value).length <= 1800);
    assert.doesNotMatch(value, /never-store-me|private@example/);
  }
  assert.deepEqual((await f.cache.load(user))!.tickets, [row]);
});

test('server replacement updates used state and completely removes refunded/removed tickets, including an empty list', async () => {
  const f = fixture(); await f.cache.save(snapshot(), () => true);
  await f.cache.save(snapshot([ticket({ isValidated: true })]), () => true);
  assert.equal(ticketStatus((await f.cache.load(user))!.tickets[0]!), 'used');
  await f.cache.save(snapshot([]), () => true);
  assert.deepEqual((await f.create().load(user))!.tickets, []);
  assert.doesNotMatch([...f.disk.values()].join(''), /CaseSensitive/);
});

test('failed refresh storage cannot revive a ticket removed by the server and does not block online tickets', async () => {
  const f = fixture(); await f.cache.save(snapshot(), () => true); f.fail(true);
  const client = new QueryClient();
  const result = await client.fetchQuery(ticketQueryOptions(user, 'token', f.cache, () => true, async () => []));
  assert.deepEqual(result.tickets, []); assert.equal(result.storageError, true);
  assert.equal(await f.create().load(user), null);
  f.fail(false);
  await f.cache.save(snapshot(), () => true);
  assert.equal((await f.cache.load(user))!.tickets.length, 1);
  client.clear();
});

test('partial, corrupt and foreign stored records never yield QR credentials; an online response repairs them', async () => {
  for (const kind of ['manifest', 'missing-part', 'foreign'] as const) {
    const f = fixture(); await f.cache.save(snapshot(), () => true);
    const [base, value] = [...f.disk].find(([, raw]) => raw.includes('"generation"'))!;
    const manifest = JSON.parse(value), part = `${base}.${manifest.generation}.0`;
    if (kind === 'manifest') f.disk.set(base, '{broken');
    if (kind === 'missing-part') f.disk.delete(part);
    if (kind === 'foreign') f.disk.set(part, f.disk.get(part)!.replace(user, other));
    await assert.rejects(f.create().load(user));
    await f.cache.save(snapshot([]), () => true);
    assert.deepEqual((await f.cache.load(user))!.tickets, []);
  }
});

test('concurrent writes and logout are serialized; an obsolete API response cannot repopulate cache', async () => {
  const f = fixture(), response = deferred<unknown>(); let current = true;
  const client = new QueryClient();
  const request = client.fetchQuery(ticketQueryOptions(user, 'old-token', f.cache, () => current, () => response.promise));
  await f.cache.save(snapshot(), () => true);
  current = false; await f.cache.remove(user); response.resolve([ticket()]);
  await assert.rejects(request, /TICKET_SESSION_CHANGED/);
  assert.equal(await f.cache.load(user), null);
  current = true;
  await Promise.all([f.cache.save(snapshot(), () => current), f.cache.save(snapshot([]), () => current)]);
  assert.deepEqual((await f.cache.load(user))!.tickets, []);
  client.clear();
});

test('logout during final secure write invalidates the manifest and cleans newly written credentials', async () => {
  const f = fixture(), writing = deferred<void>(), resume = deferred<void>(); let current = true;
  const store = createTicketCache({ ...f.storage, setItem: async (key, value) => {
    if (value.includes('"generation"')) { writing.resolve(); await resume.promise; }
    await f.storage.setItem(key, value);
  } }, 'staging', () => id(30));
  const save = store.save(snapshot(), () => current);
  await writing.promise; current = false;
  const remove = store.remove(user); resume.resolve();
  await assert.rejects(save); await remove;
  assert.equal(await store.load(user), null); assert.equal(f.disk.size, 0);
});

test('network/timeouts/server outages permit saved data but auth, malformed responses and aborts do not', () => {
  for (const cause of [null, new TypeError('Network failed'), new ApiError(0, 'TIMEOUT'), new ApiError(503, 'Unavailable'), new ApiError(429, 'Rate limited')]) assert.equal(canUseSavedTickets(cause), true);
  for (const cause of [new ApiError(0, 'INVALID_RESPONSE'), new ApiError(401, 'Unauthorized'), new ApiError(403, 'Forbidden'), new ApiError(400, 'Invalid'), Object.assign(new Error('Aborted'), { name: 'AbortError' })]) assert.equal(canUseSavedTickets(cause), false);
});

test('denied ticket access purges the saved cache while a temporary outage preserves it', async () => {
  for (const status of [401, 403, 503]) {
    const f = fixture(); await f.cache.save(snapshot(), () => true); const client = new QueryClient();
    await assert.rejects(client.fetchQuery(ticketQueryOptions(user, 'token', f.cache, () => true, async () => { throw new ApiError(status, 'Failure'); })));
    assert.equal(!!await f.cache.load(user), status === 503);
    client.clear();
  }
});

test('cold offline session restores the same account for ticket access; logout then clears its cache', async () => {
  const f = fixture(); await f.cache.save(snapshot(), () => true);
  const account = { id: user, username: 'QA', email: 'qa@example.test', role: 'user', hasPassword: true, createdAt: '2026-01-01T00:00Z' } as Account;
  let raw: string | null = JSON.stringify({ token: 'saved-token', user: account });
  const controller = new SessionController({ read: async () => raw, write: async value => { raw = value; } }, {
    me: async () => { throw new TypeError('Network failed'); }, login: async () => ({ token: 'unused' }), update: async () => account,
  }, () => { const previous = controller.getSnapshot().user?.id; if (previous) void f.cache.remove(previous); });
  await controller.hydrate();
  assert.equal(controller.getSnapshot().offline, true);
  assert.equal((await f.cache.load(controller.getSnapshot().user!.id))!.tickets[0]!.validationHash, ticket().validationHash);
  await controller.logout(); assert.equal(raw, null);
  assert.equal(await f.cache.load(user), null);
});
