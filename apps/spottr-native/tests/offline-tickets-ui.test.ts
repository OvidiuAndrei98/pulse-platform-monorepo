import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { createTicketCache, type SavedTickets, type TicketCache } from '../src/data/ticketCache';
import * as ticketQueries from '../src/data/ticketQuery';
import { ApiError } from '../src/data/http';
import type { UserTicket } from '../src/data/tickets';

const user = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const row = { id: '33333333-3333-4333-8333-333333333333', eventId: other, validationHash: 'ExactQR', isValidated: false,
  eventTitle: 'Night', ticketTypeName: 'General', locationName: 'Venue', startTime: '2099-01-01T20:00Z', endTime: '2099-01-02T06:00Z' } as UserTicket;
const saved = (): SavedTickets => ({ accountId: user, savedAt: Date.now() - 60_000, tickets: [row] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; }

// Execute the actual hook with real QueryClient/QueryObserver and persistence.
// Only React scheduling, AppState and HTTP are simulated; no native storage/API.
async function fixture() {
  const disk = new Map<string, string>(); let gen = 3;
  const cache = createTicketCache({ getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value); }, removeItem: async key => { disk.delete(key); } }, 'test', () => `44444444-4444-4444-4444-${String(gen++).padStart(12, '0')}`);
  await cache.save(saved(), () => true);
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  const auth = { ready: true, user: { id: user } as { id: string } | null, token: 'token-a' };
  let read: () => Promise<unknown> = async () => { throw new TypeError('Network unavailable'); };
  let dirty = true, index = 0, result: any, observer: QueryObserver<any> | undefined, unsubscribe: (() => void) | undefined, options: any;
  const slots: any[] = [], effects: (() => void)[] = [], listeners = new Set<(state: string) => void>();
  let load: TicketCache['load'] = id => cache.load(id);
  const exports: any = {};
  const deps: Record<string, unknown> = {
    react: {
      useState(initial: any) {
        const i = index++; if (!(i in slots)) slots[i] = initial;
        return [slots[i], (value: any) => { if (!Object.is(slots[i], value)) { slots[i] = value; dirty = true; } }];
      },
      useEffect(effect: () => unknown, values: unknown[]) {
        const i = index++, prev = slots[i];
        if (prev && prev.values.length === values.length && values.every((value, n) => Object.is(value, prev.values[n]))) return;
        effects.push(() => { prev?.cleanup?.(); slots[i] = { values, cleanup: effect() }; });
      },
    },
    'react-native': { Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: (_: string, fn: (state: string) => void) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } } },
    '@tanstack/react-query': { useQueryClient: () => client, useQuery: (next: any) => {
      options = next;
      if (!observer) { observer = new QueryObserver(client, next); unsubscribe = observer.subscribe(() => { dirty = true; }); }
      else observer.setOptions(next);
      return observer.getCurrentResult();
    } },
    '../auth/AuthProvider': { useAuth: () => ({ ...auth, controller: { getToken: () => auth.token, getSnapshot: () => auth } }), accountApi: async () => read() },
    './ticketStorage': { ticketCache: { ...cache, load: (id: string) => load(id) } },
    './ticketQuery': ticketQueries,
  };
  const js = ts.transpileModule(readFileSync(resolve(__dirname, '../src/data/useTickets.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(js, { exports, require: (name: string) => { if (!(name in deps)) throw Error('Missing mock: ' + name); return deps[name]; } });
  return {
    auth, cache, client, listeners,
    load: (next: typeof load) => { load = next; }, read: (next: typeof read) => { read = next; },
    options: () => options, value: () => result,
    async flush() { dirty = true; for (let i = 0; i < 25; i++) { if (dirty) { dirty = false; index = 0; result = exports.useTickets(); while (effects.length) effects.shift()!(); } await new Promise(resolve => setTimeout(resolve, 1)); } },
    close() { unsubscribe?.(); observer?.destroy(); slots.forEach(slot => slot?.cleanup?.()); client.clear(); },
  };
}

test('cold offline launch exposes saved QR with an offline notice instead of blocking on API failure', async () => {
  const f = await fixture(); await f.flush();
  assert.equal(f.value().data[0].validationHash, 'ExactQR');
  assert.equal(f.value().isPending, false); assert.equal(f.value().isError, false); assert.equal(f.value().offline, true);
  assert.ok(f.value().savedAt);
  assert.equal(f.options().refetchInterval(f.client.getQueryCache().getAll()[0]), 15000);
  f.listeners.forEach(fn => fn('background')); await f.flush();
  assert.equal(f.options().enabled, false); assert.equal(f.options().refetchInterval(f.client.getQueryCache().getAll()[0]), false);
  f.close();
});

test('saved QR is visible while the network request is still pending, then a fresh empty list removes it', async () => {
  const f = await fixture(), response = deferred<unknown>(); f.read(() => response.promise);
  await f.flush(); assert.equal(f.value().data.length, 1); assert.equal(f.value().offline, true);
  response.resolve([]); await f.flush();
  assert.equal(f.value().data.length, 0); assert.equal(f.value().offline, false);
  assert.deepEqual((await f.cache.load(user))!.tickets, []);
  f.close();
});

test('a slow local read never replaces a server result or a successful empty list', async () => {
  const f = await fixture(), local = deferred<SavedTickets | null>(); f.load(() => local.promise); f.read(async () => []);
  await f.flush(); assert.equal(f.value().data.length, 0);
  local.resolve(saved()); await f.flush();
  assert.equal(f.value().data.length, 0); assert.equal(f.value().offline, false);
  f.close();
});

test('late saved credentials cannot become visible after logout or account switch', async () => {
  const f = await fixture(), local = deferred<SavedTickets | null>(); f.load(() => local.promise);
  await f.flush(); f.auth.user = { id: other }; f.auth.token = 'token-b'; f.client.clear();
  local.resolve(saved()); await f.flush();
  // The mock read intentionally returns user A's snapshot even for user B.
  assert.equal(f.client.getQueryData(['tickets', user]), undefined);
  assert.equal(f.value().data, undefined);
  f.auth.user = null; f.auth.token = ''; f.client.clear(); await f.flush();
  assert.equal(f.value().data, undefined);
  f.close();
});

test('refresh restores current used status and clears offline notice; invalid API responses do not expose cached QR', async () => {
  const f = await fixture(); await f.flush();
  f.read(async () => [{ ...row, isValidated: true }]); await f.value().refetch(); await f.flush();
  assert.equal(f.value().offline, false); assert.equal(f.value().data[0].isValidated, true);
  assert.equal((await f.cache.load(user))!.tickets[0]!.isValidated, true);
  f.read(async () => ({ unexpected: true })); await f.value().refetch(); await f.flush();
  assert.equal(f.value().data, undefined); assert.equal(f.value().isError, true);
  f.close();
});

test('a denied response cannot be hidden by a local read that finishes later', async () => {
  const f = await fixture(), local = deferred<SavedTickets | null>(); f.load(() => local.promise);
  f.read(async () => { throw new ApiError(403, 'Forbidden'); });
  await f.flush(); local.resolve(saved()); await f.flush();
  assert.equal(f.value().data, undefined); assert.equal(f.value().isError, true);
  assert.equal(await f.cache.load(user), null);
  f.close();
});
