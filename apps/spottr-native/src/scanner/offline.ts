import { parseSnapshot, record, ticketCode, uuid, type Snapshot, type SyncBatch, type SyncResult, type ValidationEvent, type ValidationResult } from './data';
import { observeOperation, observeStorage } from '../diagnostics/handled';

export type OfflineScan = { clientScanId: string; snapshotId: string; deviceId: string; validationHash: string; scannedAt: string; ticketId: string; ticketType: string; status: 'pending' | 'synced' | 'conflict'; serverStatus?: SyncResult['status'] };
export type OfflineState = { version: 1; eventId: string; snapshot?: Snapshot; event?: ValidationEvent; revoked: boolean; scans: OfflineScan[]; online: Record<string, { ticketId: string; ticketType: string; validatedAt: string }>; attempts: Record<string, true> };
export type OfflineResult = { status: 'accepted' | 'duplicate'; ticketType: string; ticketId: string } | { status: 'unknown' | 'expired' | 'unprepared' | 'revoked' | 'uncertain' };
export type ScannerStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; getAllKeys(): Promise<readonly string[]> };
export type Exclusive = <T>(key: string, task: () => Promise<T>) => Promise<T>;
const PREFIX = 'spottr-native:scanner:v1:';
function scope(userId: string, eventId?: string) { if (!uuid.test(userId) || eventId !== undefined && !uuid.test(eventId)) throw new Error('INVALID_SCANNER_ID'); return PREFIX + userId.toLowerCase() + ':' + (eventId?.toLowerCase() ?? ''); }

/** Shared within one JS runtime. Browser storage additionally uses Web Locks. */
export function serialLock(): Exclusive {
  const tasks = new Map<string, Promise<unknown>>();
  return async (key, task) => {
    const prior = tasks.get(key) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(task); tasks.set(key, next);
    try { return await next; } finally { if (tasks.get(key) === next) tasks.delete(key); }
  };
}
const sharedLock = serialLock();
export function createOfflineScanner(storage: ScannerStorage, randomUUID: () => string, now = Date.now, exclusive = sharedLock) {
  const syncing = new Map<string, Promise<SyncResult[]>>();
  const empty = (eventId: string): OfflineState => ({ version: 1, eventId, revoked: false, scans: [], online: {}, attempts: {} });
  const read = (userId: string, eventId: string) => observeStorage('scanner_storage', () => readStored(userId, eventId));
  async function readStored(userId: string, eventId: string): Promise<OfflineState> {
    const raw = await storage.getItem(scope(userId, eventId)); if (raw === null) return empty(eventId);
    // Never replace a corrupt journal with an empty one: that could admit a used ticket.
    const row = record(JSON.parse(raw));
    if (row.version !== 1 || row.eventId !== eventId || !Array.isArray(row.scans) || typeof row.revoked !== 'boolean') throw new Error('OFFLINE_STORAGE_CORRUPT');
    record(row.online); record(row.attempts);
    if (row.snapshot) parseSnapshot(row.snapshot, eventId);
    for (const value of row.scans) {
      const scan = record(value);
      if (typeof scan.clientScanId !== 'string' || !uuid.test(scan.clientScanId) || typeof scan.snapshotId !== 'string' || !uuid.test(scan.snapshotId) || typeof scan.deviceId !== 'string' || !uuid.test(scan.deviceId) || !['pending', 'synced', 'conflict'].includes(String(scan.status)) || !Number.isFinite(Date.parse(String(scan.scannedAt))) || typeof scan.ticketId !== 'string' || !uuid.test(scan.ticketId) || typeof scan.ticketType !== 'string') throw new Error('OFFLINE_STORAGE_CORRUPT');
      ticketCode(scan.validationHash);
    }
    return row as unknown as OfflineState;
  }
  async function write(userId: string, eventId: string, state: OfflineState) { await observeStorage('scanner_storage', () => storage.setItem(scope(userId, eventId), JSON.stringify(state))); }
  async function deviceId() {
    return exclusive(PREFIX + 'device', async () => {
      const value = await observeStorage('scanner_storage', () => storage.getItem(PREFIX + 'device')); if (value && uuid.test(value)) return value;
      const created = randomUUID(); await observeStorage('scanner_storage', () => storage.setItem(PREFIX + 'device', created)); return created;
    });
  }
  async function state(userId: string, eventId: string) { return exclusive(scope(userId, eventId), () => read(userId, eventId)); }
  async function save(userId: string, snapshot: Snapshot, event: ValidationEvent) {
    const validated = parseSnapshot(snapshot, event.id);
    return exclusive(scope(userId, event.id), async () => {
      const current = await read(userId, event.id);
      if (current.scans.some(scan => scan.status === 'pending')) throw new Error('OFFLINE_SCANS_PENDING');
      if (Date.parse(validated.expiresAt) <= now()) throw new Error('OFFLINE_PACKAGE_EXPIRED');
      // Retain the consumed-ticket ledger across package refreshes.
      await write(userId, event.id, { ...current, snapshot: validated, event, revoked: false });
    });
  }
  async function scan(userId: string, eventId: string, value: string): Promise<OfflineResult> {
    const hash = ticketCode(value), device = await deviceId();
    return exclusive(scope(userId, eventId), async () => {
      const current = await read(userId, eventId);
      if (current.revoked) return { status: 'revoked' };
      const snapshot = current.snapshot;
      if (!snapshot) return { status: 'unprepared' };
      const time = now();
      if (time >= Date.parse(snapshot.expiresAt) || time < Date.parse(snapshot.generatedAt)) return { status: 'expired' };
      const duplicate = current.scans.find(scan => scan.validationHash === hash) ?? current.online[hash];
      if (duplicate) return { status: 'duplicate', ticketType: duplicate.ticketType, ticketId: duplicate.ticketId };
      if (current.attempts[hash]) return { status: 'uncertain' };
      const ticket = snapshot.tickets.find(ticket => ticket.validationHash === hash);
      if (!ticket) return { status: 'unknown' };
      const scan: OfflineScan = { ...ticket, clientScanId: randomUUID(), snapshotId: snapshot.snapshotId, deviceId: device, scannedAt: new Date(time).toISOString(), status: 'pending' };
      current.scans.push(scan);
      // Acceptance is only returned after durable storage succeeds.
      await write(userId, eventId, current);
      return { status: 'accepted', ticketType: ticket.ticketType, ticketId: ticket.ticketId };
    });
  }
  async function rememberOnline(userId: string, eventId: string, hash: string, result: ValidationResult) {
    return exclusive(scope(userId, eventId), async () => {
      const current = await read(userId, eventId);
      current.online[ticketCode(hash)] = { ticketId: result.ticketId, ticketType: result.ticketType, validatedAt: result.validatedAt };
      delete current.attempts[ticketCode(hash)];
      await write(userId, eventId, current);
    });
  }
  async function beginOnline(userId: string, eventId: string, hash: string) {
    return exclusive(scope(userId, eventId), async () => { const current = await read(userId, eventId); current.attempts[ticketCode(hash)] = true; await write(userId, eventId, current); });
  }
  async function revoke(userId: string, eventId: string) { return exclusive(scope(userId, eventId), async () => { const current = await read(userId, eventId); current.revoked = true; await write(userId, eventId, current); }); }
  async function remove(userId: string, eventId: string) {
    return exclusive(scope(userId, eventId), async () => {
      const current = await read(userId, eventId); if (current.scans.some(scan => scan.status === 'pending')) return false;
      // Delete the package, preserving durable deduplication/conflict history.
      delete current.snapshot; await write(userId, eventId, current); return true;
    });
  }
  async function events(userId: string) {
    const prefix = scope(userId), result: ValidationEvent[] = [];
    for (const key of await observeStorage('scanner_storage', () => storage.getAllKeys())) {
      if (!key.startsWith(prefix) || !uuid.test(key.slice(prefix.length))) continue;
      const current = await state(userId, key.slice(prefix.length)), snapshot = current.snapshot;
      if (!snapshot || !current.event || current.revoked || Date.parse(snapshot.expiresAt) <= now() && !current.scans.some(scan => scan.status === 'pending')) continue;
      result.push(current.event);
    }
    return result.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  function sync(userId: string, eventId: string, send: (batch: SyncBatch) => Promise<{ results: SyncResult[] }>) {
    const key = scope(userId, eventId), current = syncing.get(key); if (current) return current;
    const task = observeOperation('scanner_sync', async () => {
      const pending = (await state(userId, eventId)).scans.filter(scan => scan.status === 'pending');
      const groups = new Map<string, OfflineScan[]>();
      for (const scan of pending) { const key = scan.snapshotId + ':' + scan.deviceId; const group = groups.get(key) ?? []; group.push(scan); groups.set(key, group); }
      const all: SyncResult[] = [];
      for (const group of groups.values()) for (let offset = 0; offset < group.length; offset += 200) {
        const batch = group.slice(offset, offset + 200);
        const response = await send({ snapshotId: batch[0]!.snapshotId, deviceId: batch[0]!.deviceId, scans: batch.map(({ clientScanId, validationHash, scannedAt }) => ({ clientScanId, validationHash, scannedAt })) });
        const results = record(response).results;
        if (!Array.isArray(results) || results.length !== batch.length) throw new Error('INCOMPLETE_OFFLINE_SYNC');
        const expected = new Set(batch.map(scan => scan.clientScanId));
        for (const value of results) { const result = record(value); if (typeof result.clientScanId !== 'string' || !expected.delete(result.clientScanId) || !['accepted', 'already_validated', 'invalid', 'wrong_event'].includes(String(result.status))) throw new Error('INVALID_OFFLINE_SYNC'); }
        await exclusive(key, async () => {
          const current = await read(userId, eventId);
          const byId = new Map((results as SyncResult[]).map(result => [result.clientScanId, result]));
          for (const scan of current.scans) { const result = byId.get(scan.clientScanId); if (result && scan.status === 'pending') { scan.status = result.status === 'accepted' ? 'synced' : 'conflict'; scan.serverStatus = result.status; } }
          await write(userId, eventId, current);
        });
        all.push(...results as SyncResult[]);
      }
      return all;
    }).finally(() => syncing.delete(key));
    syncing.set(key, task); return task;
  }
  return { state, save, scan, beginOnline, rememberOnline, revoke, remove, events, sync };
}
