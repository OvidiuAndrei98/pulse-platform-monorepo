import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, ApiError } from '../src/data/http';
import { createScannerApi, mergeValidationEvents, parseSnapshot, parseValidation, ticketCode, type Snapshot, type ValidationEvent } from '../src/scanner/data';
import { createOfflineScanner, serialLock, type ScannerStorage } from '../src/scanner/offline';
import { AdmissionGate, admitTicket } from '../src/scanner/admission';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const hash = (value: number) => value.toString(16).padStart(64, '0');
const time = Date.parse('2026-10-10T18:00:00Z'), user = id(1), eventId = id(2);
const event: ValidationEvent = { id: eventId, title: 'After Dark', startTime: '2026-10-10T16:00:00Z', endTime: '2026-10-11T02:00:00Z', status: 'published', locationName: 'Club', canManage: true };
function snapshot(count = 3): Snapshot { return { snapshotId: id(3), eventId, eventTitle: 'After Dark', generatedAt: '2026-10-10T15:00:00Z', expiresAt: event.endTime, ticketCount: count, tickets: Array.from({ length: count }, (_, index) => ({ ticketId: id(1000 + index), ticketType: 'General', validationHash: hash(index + 1) })) }; }
function fixture() {
  let next = 10, now = time, fail = false;
  const memory = new Map<string, string>();
  const storage: ScannerStorage = { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { if (fail) throw new Error('DISK_FULL'); memory.set(key, value); }, getAllKeys: async () => [...memory.keys()] };
  const store = createOfflineScanner(storage, () => id(next++), () => now, serialLock());
  return { store, memory, storage, setTime: (value: number) => { now = value; }, failWrites: (value: boolean) => { fail = value; } };
}
const accepted = (batch: { scans: { clientScanId: string }[] }) => Promise.resolve({ results: batch.scans.map(scan => ({ clientScanId: scan.clientScanId, status: 'accepted' as const })) });

test('scanner rejects invalid ticket codes, snapshots and unknown validation statuses', () => {
  for (const value of [null, undefined, '', ' ', 'https://example.com', 'a'.repeat(63), 'z'.repeat(64)]) assert.throws(() => ticketCode(value));
  assert.equal(ticketCode(' ' + 'A'.repeat(64) + '\n'), 'a'.repeat(64));
  for (const value of [null, {}, snapshot(-1), { ...snapshot(), eventId: id(4) }, { ...snapshot(), ticketCount: 5 }, { ...snapshot(), tickets: [snapshot().tickets[0], snapshot().tickets[0]], ticketCount: 2 }, { ...snapshot(), expiresAt: 'invalid' }, { ...snapshot(), expiresAt: snapshot().generatedAt }]) assert.throws(() => parseSnapshot(value, eventId));
  assert.throws(() => parseValidation({ status: 'accepted' }));
  assert.equal(parseSnapshot(snapshot(0), eventId).ticketCount, 0);
});
test('existing invitation response is recognized after consumption and revoked invitations never show accepted', () => {
  const invitation = { ticketId: id(1000), eventId, ticketType: 'VIP', invitationLabel: 'Guest list', validatedAt: new Date(time).toISOString() };
  assert.equal(parseValidation({ ...invitation, status: 'valid' }).status, 'valid');
  assert.equal(parseValidation({ ...invitation, status: 'revoked' }).status, 'revoked');
  assert.equal(parseValidation({ ...invitation, status: 'valid' }).invitationLabel, 'Guest list');
  assert.throws(() => parseValidation({ ...invitation, eventId: undefined, status: 'valid' }));
});
test('100 concurrent scans on one device durably accept exactly once, including after restart', async () => {
  const f = fixture(); await f.store.save(user, snapshot(), event);
  const results = await Promise.all(Array.from({ length: 100 }, () => f.store.scan(user, eventId, hash(1))));
  assert.equal(results.filter(result => result.status === 'accepted').length, 1);
  assert.equal(results.filter(result => result.status === 'duplicate').length, 99);
  const restarted = createOfflineScanner(f.storage, () => id(999), () => time);
  assert.equal((await restarted.scan(user, eventId, hash(1))).status, 'duplicate');
  assert.equal((await f.store.state(user, eventId)).scans.length, 1);
});
test('empty, unprepared, wrong package and expired scans never admit', async () => {
  const f = fixture(); assert.equal((await f.store.scan(user, eventId, hash(1))).status, 'unprepared');
  await f.store.save(user, snapshot(), event);
  assert.equal((await f.store.scan(user, eventId, hash(100))).status, 'unknown');
  f.setTime(Date.parse(event.endTime)); assert.equal((await f.store.scan(user, eventId, hash(1))).status, 'expired');
  f.setTime(Date.parse(snapshot().generatedAt) - 1); assert.equal((await f.store.scan(user, eventId, hash(1))).status, 'expired');
});
test('expiry, package replacement and removal retain pending admissions, then permit sync after event ends', async () => {
  const f = fixture(); await f.store.save(user, snapshot(), event); await f.store.scan(user, eventId, hash(1));
  assert.equal(await f.store.remove(user, eventId), false);
  await assert.rejects(f.store.save(user, { ...snapshot(), snapshotId: id(4) }, event), /OFFLINE_SCANS_PENDING/);
  f.setTime(Date.parse(event.endTime) + 86400000);
  assert.equal((await f.store.events(user)).length, 1);
  const results = await f.store.sync(user, eventId, accepted); assert.equal(results.length, 1);
  assert.equal((await f.store.state(user, eventId)).scans[0]!.status, 'synced');
  assert.equal((await f.store.events(user)).length, 0); assert.equal(await f.store.remove(user, eventId), true);
  assert.equal((await f.store.state(user, eventId)).scans.length, 1);
});

test('an empty live-event response keeps ended pending admissions reachable until synchronized', async () => {
  const f = fixture(); await f.store.save(user, snapshot(), event); await f.store.scan(user, eventId, hash(1));
  f.setTime(Date.parse(event.endTime) + 1000);
  // This is the real server contract: ListValidationEvents excludes ended events.
  const remote: ValidationEvent[] = [];
  const visible = mergeValidationEvents(remote, await f.store.events(user));
  assert.deepEqual(visible.map(row => row.id), [eventId]);
  assert.equal((await f.store.state(user, eventId)).revoked, false);
  assert.equal((await f.store.scan(user, eventId, hash(2))).status, 'expired');
  await f.store.sync(user, visible[0]!.id, accepted);
  assert.equal((await f.store.state(user, eventId)).scans[0]!.status, 'synced');
  assert.deepEqual(mergeValidationEvents(remote, await f.store.events(user)), []);
});

test('validation event merge deduplicates packages and prefers current server metadata', () => {
  const remote = { ...event, title: 'Updated venue event', canManage: false };
  const stored = { ...event }, remoteRows = [remote], localRows = [stored];
  assert.deepEqual(mergeValidationEvents(remoteRows, localRows), [remote]);
  assert.equal(localRows[0]!.title, event.title);
  assert.deepEqual(mergeValidationEvents([], []), []);
});
test('sync chunks at 200, retains partial progress and retries identical scan IDs', async () => {
  const f = fixture(); await f.store.save(user, snapshot(401), event);
  await Promise.all(Array.from({ length: 401 }, (_, i) => f.store.scan(user, eventId, hash(i + 1))));
  const sizes: number[] = [], failedIds: string[] = [];
  await assert.rejects(f.store.sync(user, eventId, async batch => { sizes.push(batch.scans.length); if (sizes.length === 2) { failedIds.push(...batch.scans.map(scan => scan.clientScanId)); throw new Error('NETWORK'); } return accepted(batch); }), /NETWORK/);
  assert.deepEqual(sizes, [200, 200]);
  const partial = await f.store.state(user, eventId); assert.equal(partial.scans.filter(scan => scan.status === 'synced').length, 200);
  const retried: string[] = [], retrySizes: number[] = [];
  await f.store.sync(user, eventId, async batch => { retrySizes.push(batch.scans.length); retried.push(...batch.scans.map(scan => scan.clientScanId)); return accepted(batch); });
  assert.deepEqual(retrySizes, [200, 1]); assert.deepEqual(retried.slice(0, 200), failedIds);
});
test('concurrent synchronization is single flight; new scans are retained for next batch', async () => {
  const f = fixture(); await f.store.save(user, snapshot(), event); await f.store.scan(user, eventId, hash(1));
  let release!: () => void; const pause = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
  const send = async (batch: Parameters<typeof accepted>[0]) => { calls++; await pause; return accepted(batch); };
  const first = f.store.sync(user, eventId, send), second = f.store.sync(user, eventId, send); assert.equal(first, second);
  await f.store.scan(user, eventId, hash(2)); release(); await first;
  assert.equal(calls, 1); assert.equal((await f.store.state(user, eventId)).scans.filter(scan => scan.status === 'pending').length, 1);
});
test('malformed sync cannot acknowledge missing, unrelated or duplicate scans; conflicts remain visible', async () => {
  for (const kind of ['missing', 'foreign', 'invalid']) {
    const f = fixture(); await f.store.save(user, snapshot(), event); await f.store.scan(user, eventId, hash(1));
    await assert.rejects(f.store.sync(user, eventId, async batch => ({ results: kind === 'missing' ? [] : [{ clientScanId: kind === 'foreign' ? id(990) : batch.scans[0]!.clientScanId, status: kind === 'invalid' ? '???' : 'accepted' }] as never })));
    assert.equal((await f.store.state(user, eventId)).scans[0]!.status, 'pending');
  }
  const f = fixture(); await f.store.save(user, snapshot(), event); await f.store.scan(user, eventId, hash(1));
  await f.store.sync(user, eventId, async batch => ({ results: [{ clientScanId: batch.scans[0]!.clientScanId, status: 'already_validated' }] }));
  assert.equal((await f.store.state(user, eventId)).scans[0]!.status, 'conflict');
  assert.equal((await f.store.scan(user, eventId, hash(1))).status, 'duplicate');
});
test('storage failures and corruption fail closed without returning admission', async () => {
  const f = fixture(); await f.store.save(user, snapshot(), event); f.failWrites(true);
  await assert.rejects(f.store.scan(user, eventId, hash(1)), /DISK_FULL/); f.failWrites(false);
  assert.equal((await f.store.state(user, eventId)).scans.length, 0);
  const key = [...f.memory.keys()].find(key => key.endsWith(eventId))!; f.memory.set(key, '{broken');
  await assert.rejects(f.store.scan(user, eventId, hash(1)));
  await assert.rejects(f.store.save(user, snapshot(), event));
  assert.equal(f.memory.get(key), '{broken');
});
test('users and event scopes never share tickets; revoked staff cannot admit offline', async () => {
  const f = fixture(); await f.store.save(user, snapshot(), event);
  assert.equal((await f.store.scan(id(88), eventId, hash(1))).status, 'unprepared');
  assert.deepEqual(await f.store.events(id(88)), []);
  await f.store.scan(user, eventId, hash(1)); await f.store.revoke(user, eventId);
  assert.equal((await f.store.scan(user, eventId, hash(2))).status, 'revoked'); assert.deepEqual(await f.store.events(user), []);
  assert.equal((await f.store.state(user, eventId)).scans[0]!.status, 'pending');
});
test('gate serializes repeated camera frames and requires explicit rearm after success or error', async () => {
  const gate = new AdmissionGate(); let calls = 0, release!: () => void; const pause = new Promise<void>(resolve => { release = resolve; });
  const work = async () => { calls++; await pause; return { status: 'unknown' as const }; };
  const first = gate.run(work); assert.equal(await gate.run(work), undefined); gate.reset(); assert.equal(await gate.run(work), undefined);
  release(); await first; assert.equal(await gate.run(work), undefined); assert.equal(calls, 1);
  gate.reset(); await assert.rejects(gate.run(async () => { throw new Error('FAIL'); })); assert.equal(await gate.run(work), undefined);
  gate.reset(); await gate.run(work); assert.equal(calls, 2);
});
test('ambiguous online timeout is durably blocked from later offline admission and no POST follows failed storage', async () => {
  const f = fixture(); await f.store.save(user, snapshot(), event); let calls = 0;
  const options = { userId: user, eventId, hash: hash(1), offline: false, store: f.store, sync: async () => {}, validate: async () => { calls++; throw new ApiError(0, 'TIMEOUT'); } };
  await assert.rejects(admitTicket(options));
  assert.equal((await f.store.scan(user, eventId, hash(1))).status, 'uncertain');
  const restarted = createOfflineScanner(f.storage, () => id(999), () => time);
  assert.equal((await restarted.scan(user, eventId, hash(1))).status, 'uncertain');
  f.failWrites(true); await assert.rejects(admitTicket({ ...options, hash: hash(2) })); assert.equal(calls, 1);
});
test('online acceptance records dedup ledger and sync failure prevents consume; access denial revokes offline', async () => {
  const f = fixture(); await f.store.save(user, snapshot(), event); let calls = 0;
  const options = { userId: user, eventId, hash: hash(1), offline: false, store: f.store, sync: async () => {}, validate: async () => { calls++; return { status: 'valid' as const, ticketId: id(1000), ticketType: 'General', eventTitle: event.title, validatedAt: new Date(time).toISOString() }; } };
  assert.equal((await admitTicket(options)).status, 'valid'); assert.equal((await f.store.scan(user, eventId, hash(1))).status, 'duplicate');
  await assert.rejects(admitTicket({ ...options, hash: hash(2), sync: async () => { throw new Error('SYNC'); } })); assert.equal(calls, 1);
  await assert.rejects(admitTicket({ ...options, validate: async () => { throw new ApiError(403, 'DENIED'); } })); assert.equal((await f.store.scan(user, eventId, hash(2))).status, 'revoked');
});
test('scanner API uses exact scope and bearer, rejects invalid input and keeps quick scanner auth isolated', async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const api = createScannerApi(createHttp('https://mock/api/v1', async (input, init) => { requests.push({ url: String(input), init: init ?? {} }); return new Response(JSON.stringify({ status: 'already_validated', ticketId: id(1000), ticketType: 'General', eventTitle: event.title, validatedAt: new Date(time).toISOString() }), { status: 200 }); }));
  assert.equal((await api.validate(eventId, hash(1), 'account-token')).status, 'already_validated');
  assert.equal(requests[0]!.url, `https://mock/api/v1/dashboard/ticket-validation/events/${eventId}/tickets/validate`);
  assert.equal(new Headers(requests[0]!.init.headers).get('Authorization'), 'Bearer account-token');
  await assert.rejects(api.validate('../events', hash(1), 'token'));
  await assert.rejects(api.validate(eventId, 'null', 'token'));
  await assert.rejects(api.quickValidate({ sessionToken: 'quick-token', label: 'Gate', eventTitle: event.title, locationName: 'Club', expiresAt: new Date(time - 1).toISOString() }, hash(1), time));
  assert.equal(requests.length, 1);
  await api.quickValidate({ sessionToken: 'quick-token', label: 'Gate', eventTitle: event.title, locationName: 'Club', expiresAt: new Date(time + 1).toISOString() }, hash(1), time);
  assert.equal(new Headers(requests[1]!.init.headers).get('Authorization'), 'Bearer quick-token');
  assert.equal(requests[1]!.url, 'https://mock/api/v1/ticket-validation/quick-access/validate');
});
