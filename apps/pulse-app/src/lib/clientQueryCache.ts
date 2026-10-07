type Snapshot<T> = {
  data: T | undefined;
  hasData: boolean;
  refreshing: boolean;
  error: unknown;
  updatedAt: number;
};
type Entry = { snapshot: Snapshot<unknown>; request?: Promise<void> };
type RefreshOptions = { staleTimeMs?: number; force?: boolean };
const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const MAX_ENTRIES = 80;

function notify(key: string) {
  listeners.get(key)?.forEach((listener) => listener());
}

export function readClientQuery<T>(key: string): Snapshot<T> | undefined {
  return entries.get(key)?.snapshot as Snapshot<T> | undefined;
}

export function subscribeClientQuery(key: string, listener: () => void) {
  const subscribers = listeners.get(key) ?? new Set();
  subscribers.add(listener);
  listeners.set(key, subscribers);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) listeners.delete(key);
  };
}

export function refreshClientQuery<T>(
  key: string,
  load: () => Promise<T>,
  options: RefreshOptions = {},
): Promise<void> {
  const existing = entries.get(key);
  if (existing?.request) return existing.request;
  const staleTimeMs = options.staleTimeMs ?? 0;
  if (
    !options.force &&
    existing?.snapshot.hasData &&
    !existing.snapshot.error &&
    Date.now() - existing.snapshot.updatedAt < staleTimeMs
  ) {
    return Promise.resolve();
  }
  const entry: Entry = existing ?? {
    snapshot: {
      data: undefined,
      hasData: false,
      refreshing: false,
      error: null,
      updatedAt: 0,
    },
  };
  entries.delete(key);
  entries.set(key, entry);
  // Keep the last settled view during revalidation, including a first-load
  // error. Clearing it on tab re-entry flashes error -> skeleton -> error.
  // A successful response clears the error below.
  entry.snapshot = { ...entry.snapshot, refreshing: true };
  entry.request = Promise.resolve().then(load).then((data) => {
    if (entries.get(key) !== entry) return;
    entry.snapshot = {
      data,
      hasData: true,
      refreshing: false,
      error: null,
      updatedAt: Date.now(),
    };
  }, (error: unknown) => {
    if (entries.get(key) !== entry) return;
    entry.snapshot = { ...entry.snapshot, refreshing: false, error };
  }).finally(() => {
    if (entries.get(key) !== entry) return;
    entry.request = undefined;
    notify(key);
    for (const [oldKey, oldEntry] of entries) {
      if (entries.size <= MAX_ENTRIES) break;
      if (!oldEntry.request && !listeners.has(oldKey)) entries.delete(oldKey);
    }
  });
  notify(key);
  return entry.request;
}

// A completed mutation wins over any older in-flight read.
export function updateClientQuery<T>(key: string, update: (data: T) => T) {
  const current = readClientQuery<T>(key);
  if (!current?.hasData) return;
  entries.set(key, {
    snapshot: {
      data: update(current.data as T),
      hasData: true,
      refreshing: false,
      error: null,
      updatedAt: Date.now(),
    },
  });
  notify(key);
}

export function updateClientQueries<T>(
  matches: (key: string) => boolean,
  update: (data: T, key: string) => T,
) {
  for (const key of [...entries.keys()]) {
    if (matches(key)) updateClientQuery<T>(key, (data) => update(data, key));
  }
}

export async function getClientQuery<T>(
  key: string,
  load: () => Promise<T>,
  staleTimeMs = 0,
): Promise<T> {
  await refreshClientQuery(key, load, { staleTimeMs });
  const snapshot = readClientQuery<T>(key);
  if (snapshot?.hasData) return snapshot.data as T;
  if (snapshot?.error != null) throw snapshot.error;
  throw new Error(`Client query ${key} did not return data`);
}

// Clear on logout; in-flight responses cannot repopulate the new session.
export function clearClientQueryCache() {
  const keys = [...entries.keys()];
  entries.clear();
  keys.forEach(notify);
}
