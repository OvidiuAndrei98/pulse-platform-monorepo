import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareScanner, PreparationError, offlinePackageStatus, packageAge, type PreparationProgress } from '../src/scanner/preparation';
import { createOfflineScanner, serialLock } from '../src/scanner/offline';
import { createCuePlayer } from '../src/scanner/cuePlayer';
import { holdScannerAwake } from '../src/scanner/keepAwake';
import { scannerCue } from '../src/scanner/cueType';
import { ApiError } from '../src/data/http';
import type { Snapshot, ValidationEvent } from '../src/scanner/data';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-10-13T18:00:00Z'), hash = 'a'.repeat(64);
const event: ValidationEvent = { id: id(2), title: 'Gate QA', startTime: '2026-10-13T17:00:00Z', endTime: '2026-10-14T02:00:00Z', status: 'published', locationName: 'QA Club', canManage: true };
const snapshot: Snapshot = { snapshotId: id(3), eventId: event.id, eventTitle: event.title, generatedAt: new Date(now - 300000).toISOString(), expiresAt: event.endTime, ticketCount: 1, tickets: [{ ticketId: id(4), validationHash: hash, ticketType: 'General' }] };
function fixture() {
  const data = new Map<string, string>(), progress: PreparationProgress[] = [], calls: string[] = [];
  let serial = 20, current = true, failStorage = false;
  const store = createOfflineScanner({ getItem: async key => data.get(key) ?? null, getAllKeys: async () => [...data.keys()], setItem: async (key, value) => { if (failStorage) throw Error('DISK_FULL'); data.set(key, value); } }, () => id(serial++), () => now, serialLock());
  const options: Parameters<typeof prepareScanner>[0] = {
    eventId: event.id, now: () => now, isCurrent: () => current, camera: async () => { calls.push('camera'); return true; }, online: async () => true,
    events: async () => { calls.push('events'); return [event]; },
    sync: () => store.sync(id(1), event.id, async body => { calls.push('sync'); return { results: body.scans.map(scan => ({ clientScanId: scan.clientScanId, status: 'accepted' })) }; }),
    snapshot: async () => { calls.push('snapshot'); return { ...snapshot, snapshotId: id(10) }; },
    save: (snapshot, event) => { calls.push('save'); return store.save(id(1), snapshot, event); }, read: () => store.state(id(1), event.id), revoke: () => store.revoke(id(1), event.id), progress: value => progress.push(value),
  };
  return { store, options, calls, progress, cancel: () => { current = false; }, failStorage: () => { failStorage = true; } };
}
const failsWith = (code: string) => (error: unknown) => error instanceof PreparationError && error.code === code;

test('preparation syncs pending admissions before replacing the package and reads it back', async () => {
  const f = fixture(); await f.store.save(id(1), snapshot, event); await f.store.scan(id(1), event.id, hash);
  assert.deepEqual(await prepareScanner(f.options), { tickets: 1, conflicts: 0 });
  assert.deepEqual(f.calls, ['camera', 'events', 'sync', 'snapshot', 'save']);
  const stored = await f.options.read(); assert.equal(stored.scans[0]?.status, 'synced'); assert.equal(stored.snapshot?.snapshotId, id(10));
  assert.deepEqual(f.progress.filter(value => value.status === 'done').map(value => value.step), ['camera', 'access', 'sync', 'package']);
  assert.equal((await f.store.scan(id(1), event.id, hash)).status, 'duplicate');
});
test('camera denial and offline checks stop before server access or package replacement', async () => {
  for (const code of ['camera', 'offline'] as const) {
    const f = fixture(); f.options[code === 'camera' ? 'camera' : 'online'] = async () => false;
    await assert.rejects(prepareScanner(f.options), failsWith(code));
    assert.equal(f.calls.includes('events'), false); assert.equal((await f.options.read()).snapshot, undefined);
  }
});
test('missing access and 403 revoke offline permission while preserving the journal', async () => {
  for (const forbidden of [false, true]) {
    const f = fixture(); await f.store.save(id(1), snapshot, event); await f.store.scan(id(1), event.id, hash);
    f.options.events = async () => { if (forbidden) throw new ApiError(403, 'DENIED'); return []; };
    await assert.rejects(prepareScanner(f.options));
    const state = await f.options.read(); assert.equal(state.revoked, true); assert.equal(state.scans[0]?.status, 'pending');
    assert.equal(f.calls.includes('snapshot'), false);
  }
});
test('sync failure retains pending scans; disk failure never reports a ready package', async () => {
  const f = fixture(); await f.store.save(id(1), snapshot, event); await f.store.scan(id(1), event.id, hash);
  f.options.sync = async () => { throw new TypeError('Network request failed'); };
  await assert.rejects(prepareScanner(f.options)); assert.equal(f.calls.includes('snapshot'), false);
  assert.equal((await f.options.read()).scans[0]?.status, 'pending');
  const disk = fixture(); disk.failStorage(); await assert.rejects(prepareScanner(disk.options), /DISK_FULL/);
  assert.equal(disk.progress.some(row => row.step === 'package' && row.status === 'done'), false);
});
test('switching event/account during a download discards the stale package and completion', async () => {
  const f = fixture(); f.options.snapshot = async () => { f.cancel(); return snapshot; };
  await assert.rejects(prepareScanner(f.options), failsWith('cancelled'));
  assert.equal(f.calls.includes('save'), false); assert.equal(f.progress.some(row => row.step === 'package' && row.status === 'done'), false);
});
test('expired events, mismatched storage and a clock ahead cannot produce readiness; an empty package can', async () => {
  const ended = fixture(); ended.options.events = async () => [{ ...event, endTime: new Date(now).toISOString() }];
  await assert.rejects(prepareScanner(ended.options), failsWith('ended'));
  const missing = fixture(); missing.options.save = async () => {}; await assert.rejects(prepareScanner(missing.options), failsWith('storage'));
  const future = fixture(); future.options.snapshot = async () => ({ ...snapshot, generatedAt: new Date(now + 1000).toISOString() });
  await assert.rejects(prepareScanner(future.options), failsWith('storage'));
  const empty = fixture(); empty.options.snapshot = async () => ({ ...snapshot, ticketCount: 0, tickets: [] });
  assert.deepEqual(await prepareScanner(empty.options), { tickets: 0, conflicts: 0 });
});
test('package age and readiness handle expiry boundaries, revocation and missing data', async () => {
  const f = fixture(); assert.equal(offlinePackageStatus(undefined, now), 'missing');
  await f.store.save(id(1), snapshot, event); const stored = await f.options.read();
  assert.equal(offlinePackageStatus(stored, now), 'ready');
  assert.equal(offlinePackageStatus(stored, Date.parse(snapshot.expiresAt)), 'expired');
  assert.equal(offlinePackageStatus(stored, Date.parse(snapshot.generatedAt) - 1), 'clock');
  assert.equal(offlinePackageStatus({ ...stored, revoked: true }, now), 'revoked');
  assert.equal(packageAge(snapshot.generatedAt, now, false), 'Updated 5 min ago');
  assert.equal(packageAge(new Date(now - 60000).toISOString(), now, true), 'Actualizat acum 1 min');
  assert.equal(packageAge('invalid', now, false), 'Unknown date');
});

const flush = () => new Promise(resolve => setImmediate(resolve));
test('wake lock is released after an interrupted activation without affecting a reopened camera', async () => {
  const deferred: { tag: string; resolve(): void }[] = [], released: string[] = [], seen: boolean[] = [];
  const adapter = { activate: (tag: string) => new Promise<void>(resolve => deferred.push({ tag, resolve })), deactivate: async (tag: string) => { released.push(tag); } };
  const close = holdScannerAwake(adapter, value => seen.push(value)); close();
  const closeSecond = holdScannerAwake(adapter, value => seen.push(value));
  deferred[1]!.resolve(); await flush(); deferred[0]!.resolve(); await flush();
  assert.deepEqual(seen, [true]); assert.equal(released.includes(deferred[1]!.tag), false);
  closeSecond(); assert.equal(released.at(-1), deferred[1]!.tag);
});
test('unsupported wake lock reports unavailable without rejecting the camera flow', async () => {
  const seen: boolean[] = [];
  const stop = holdScannerAwake({ activate: async () => { throw Error('DENIED'); }, deactivate: async () => { throw Error('NOT_ACTIVE'); } }, value => seen.push(value));
  await flush(); assert.deepEqual(seen, [false]); stop(); await flush();
});
test('only accepted results use the success cue; duplicates and failures sound different', () => {
  assert.equal(scannerCue({ status: 'accepted', ticketId: id(1), ticketType: 'General' }), 'success');
  assert.equal(scannerCue({ status: 'duplicate', ticketId: id(1), ticketType: 'General' }), 'duplicate');
  for (const status of ['uncertain', 'expired', 'unprepared', 'revoked', 'unknown'] as const) assert.equal(scannerCue({ status }), 'error');
  assert.equal(scannerCue(undefined, 'Network failed'), 'error'); assert.equal(scannerCue(), undefined);
});
test('muting and leaving the scanner cancel pending audio; audio failures remain harmless', async () => {
  let release: () => void = () => {}, plays = 0, removes = 0, mode: object = {};
  const audio = { setAudioModeAsync: async (options: object) => { mode = options; }, createAudioPlayer: () => ({ volume: 1, play: () => { plays++; }, pause() {}, remove: () => { removes++; }, seekTo: () => new Promise<void>(resolve => { release = resolve; }) }) };
  const player = createCuePlayer(audio, { success: 1, duplicate: 2, error: 3 });
  player.play('success'); await flush(); player.stop(); release(); await flush(); assert.equal(plays, 0);
  player.play('duplicate'); await flush(); release(); await flush(); assert.equal(plays, 1);
  player.play('error'); await flush(); player.dispose(); release(); await flush(); assert.equal(plays, 1); assert.equal(removes, 3);
  assert.deepEqual(mode, { playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
  const failed = createCuePlayer({ ...audio, setAudioModeAsync: async () => { throw Error('AUDIO_UNAVAILABLE'); } }, { success: 1, duplicate: 2, error: 3 });
  failed.play('success'); await flush(); failed.dispose();
  const blocked = createCuePlayer({ ...audio, createAudioPlayer: () => ({ volume: 1, play: async () => { throw Error('AUTOPLAY_DENIED'); }, pause() {}, remove() {}, seekTo: async () => {} }) }, { success: 1, duplicate: 2, error: 3 });
  blocked.play('success'); await flush(); blocked.dispose();
});
