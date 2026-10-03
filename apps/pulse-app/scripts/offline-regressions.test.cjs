const assert = require('node:assert/strict');
const { test } = require('node:test');
const { modules, hooks, deferred, settle } = require('./helpers/qaHarness.cjs');

// Small IndexedDB adapter to exercise the real repository, including index queries.
function repository() {
  const tables = { snapshots: new Map(), scans: new Map(), meta: new Map() };
  const keyOf = (table, value) => table === 'snapshots' ? value.cacheKey : value.clientScanId;
  const matches = (index, value, key) => JSON.stringify(index === 'by-cache-key' ? value.cacheKey :
    index === 'by-cache-hash' ? [value.cacheKey, value.validationHash] : [value.cacheKey, value.syncStatus]) === JSON.stringify(key);
  const store = table => ({
    get: async key => tables[table].get(key),
    put: async (value, key) => tables[table].set(key ?? keyOf(table, value), structuredClone(value)),
    add: async value => tables[table].set(keyOf(table, value), structuredClone(value)),
    delete: async key => tables[table].delete(key),
    clear: async () => tables[table].clear(),
    index: name => ({
      get: async key => [...tables[table].values()].find(value => matches(name, value, key)),
      count: async key => [...tables[table].values()].filter(value => matches(name, value, key)).length,
      getAllKeys: async key => [...tables[table]].filter(([, value]) => matches(name, value, key)).map(([key]) => key),
    }),
  });
  const db = {
    get: (table, key) => store(table).get(key), put: (table, value, key) => store(table).put(value, key), add: (table, value) => store(table).add(value),
    getAll: async table => [...tables[table].values()].map(value => structuredClone(value)),
    getAllFromIndex: async (table, name, key) => [...tables[table].values()].filter(value => matches(name, value, key)).map(value => structuredClone(value)),
    getFromIndex: async (table, name, key) => [...tables[table].values()].find(value => matches(name, value, key)),
    transaction: table => ({ store: store(table), objectStore: store, done: Promise.resolve() }),
  };
  const loader = modules({ idb: { openDB: async () => db } }, { IDBKeyRange: { only: value => value }, crypto: require('node:crypto').webcrypto });
  return { tables, api: loader.load('features/tickets/offlineValidationStore'), sync: loader.load('features/tickets/syncOfflineScans').syncPendingScans };
}

const manifest = (expiresAt = '2099-10-03T12:00:00Z') => ({ snapshotId: 'snapshot', eventId: 'event', eventTitle: 'Event', generatedAt: '2026-10-01T12:00:00Z', expiresAt, ticketCount: 1, tickets: [{ ticketId: 'ticket', ticketType: 'General', validationHash: 'hash' }] });

test('expired snapshots preserve pending admissions through reads, cleanup and explicit removal', async () => {
  const { api, tables } = repository();
  await api.saveOfflineSnapshot('user', manifest());
  assert.equal((await api.recordOfflineTicketScan('user', 'event', 'hash')).status, 'accepted');
  tables.snapshots.get('user:event').expiresAt = '2020-01-01T00:00:00Z';
  assert.equal((await api.recordOfflineTicketScan('user', 'event', 'hash')).status, 'expired');
  assert.equal((await api.getPendingOfflineScans('user', 'event')).length, 1);
  await api.clearExpiredOfflineData();
  assert.equal(await api.clearOfflineEventData('user', 'event'), false);
  assert.equal((await api.getOfflineValidationEvents('user')).length, 1);
  assert.equal(await api.hasPreparedOfflineValidationForUser('user'), true);
  assert.equal((await api.getOfflineValidationEvents('another-user')).length, 0);
  await assert.rejects(api.saveOfflineSnapshot('user', manifest()), /OFFLINE_SCANS_PENDING/);
  assert.equal(tables.scans.size, 1);
  await api.applyOfflineSyncResults('user', 'event', [...tables.scans.values()].map(scan => ({ clientScanId: scan.clientScanId, status: 'accepted' })));
  await api.clearExpiredOfflineData();
  assert.equal(tables.scans.size, 0); assert.equal(tables.snapshots.size, 0);
});

test('offline admissions reject unknown, duplicate, expired and unprepared tickets', async () => {
  const { api, tables } = repository();
  assert.equal((await api.recordOfflineTicketScan('user', 'event', 'hash')).status, 'unprepared');
  await api.saveOfflineSnapshot('user', manifest());
  assert.equal((await api.recordOfflineTicketScan('user', 'event', '')).status, 'unknown');
  assert.equal((await api.recordOfflineTicketScan('user', 'event', ' hash ')).status, 'accepted');
  assert.equal((await api.recordOfflineTicketScan('user', 'event', 'hash')).status, 'duplicate');
  tables.snapshots.get('user:event').expiresAt = 'invalid';
  assert.equal((await api.recordOfflineTicketScan('user', 'event', 'hash')).status, 'expired');
});

async function pendingScans(count) {
  const r = repository(); await r.api.saveOfflineSnapshot('user', manifest());
  for (let i = 0; i < count; i++) r.tables.scans.set(String(i), {
    clientScanId: String(i), cacheKey: 'user:event', eventId: 'event', snapshotId: 'snapshot', deviceId: 'device', validationHash: 'hash-' + i,
    scannedAt: '2026-10-03T12:00:00Z', syncStatus: 'pending',
  });
  return r;
}
const accept = batch => ({ results: batch.scans.map(scan => ({ clientScanId: scan.clientScanId, status: 'accepted' })) });

test('offline sync sends 200/201/401 scans in bounded batches and never sends an empty batch', async () => {
  for (const count of [0, 1, 200, 201, 401]) {
    const r = await pendingScans(count), batches = [];
    const result = await r.sync('user', 'event', async batch => { batches.push(batch.scans.length); return accept(batch); });
    assert.equal(result.length, count); assert.equal(batches.length, Math.ceil(count / 200));
    assert.equal(batches.every(size => size > 0 && size <= 200), true);
    assert.equal((await r.api.getPendingOfflineScans('user', 'event')).length, 0);
  }
});

test('offline sync persists successful batches, retries only pending records and deduplicates reconnect/manual sync', async () => {
  const r = await pendingScans(401); let calls = 0;
  await assert.rejects(r.sync('user', 'event', async batch => { if (++calls === 2) throw Error('offline'); return accept(batch); }), /offline/);
  assert.equal((await r.api.getPendingOfflineScans('user', 'event')).length, 201);
  const response = deferred(); calls = 0;
  const send = async batch => { calls++; await response.promise; return accept(batch); };
  const first = r.sync('user', 'event', send), second = r.sync('user', 'event', send);
  assert.equal(first, second);
  response.resolve(); await first;
  assert.equal(calls, 2); assert.equal((await r.api.getPendingOfflineScans('user', 'event')).length, 0);
});

test('missing acknowledgments preserve the batch; explicit conflicts remain visible', async () => {
  const r = await pendingScans(2);
  await assert.rejects(r.sync('user', 'event', async () => ({ results: [] })), /INCOMPLETE_OFFLINE_SYNC/);
  assert.equal((await r.api.getPendingOfflineScans('user', 'event')).length, 2);
  await r.sync('user', 'event', async batch => ({ results: batch.scans.map(scan => ({ clientScanId: scan.clientScanId, status: 'already_validated' })) }));
  assert.equal((await r.api.getOfflineConflictScans('user', 'event')).length, 2);
});

test('dashboard allows prepared staff offline and refuses missing packages or explicit permission denial', async () => {
  for (const [prepared, status, expectedAccess] of [[true, 0, true], [false, 0, false], [true, 503, true], [true, 403, false]]) {
    const h = hooks(), routes = [];
    class ApiError extends Error { constructor(status) { super('request failed'); this.status = status; } }
    const router = { replace: route => routes.push(route) };
    const user = { properties: { id: 'staff' }, getValidationEvents: async () => { throw status ? new ApiError(status) : new TypeError('offline'); } };
    const { DashboardAccessGuard } = modules({ react: h.react,
      'next/navigation': { usePathname: () => '/dashboard/ticket-validation', useRouter: () => router },
      '@/core/DataProviderContext': { useDataProvider: () => ({ user, loading: false, isOrganizer: false }) },
      'react-i18next': { useTranslation: () => ({ t: key => key }) }, '@/components/ui/loading': { PageLoadingState: 'loading' },
      '@packages/api-client/src/Client': { ApiError }, '@/features/tickets/offlineValidationStore': { hasPreparedOfflineValidationForUser: async id => id === 'staff' && prepared },
    }).load('app/dashboard/components/DashboardAccessGuard');
    h.render(() => DashboardAccessGuard({ children: 'scanner' })); await settle();
    assert.equal(h.render().props.children === 'scanner', expectedAccess);
    assert.equal(routes.includes('/users/me'), !expectedAccess);
  }
});
