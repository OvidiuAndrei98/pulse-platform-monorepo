type Snapshot<T> = {
  data: T | undefined;
  hasData: boolean;
  refreshing: boolean;
  error: unknown;
};
type Entry = { snapshot: Snapshot<unknown>; request?: Promise<void> };
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

export function refreshClientQuery<T>(key: string, load: () => Promise<T>): Promise<void> {
  const existing = entries.get(key);
  if (existing?.request) return existing.request;
  const entry: Entry = existing ?? { snapshot: { data: undefined, hasData: false, refreshing: false, error: null } };
  entries.delete(key);
  entries.set(key, entry);
  entry.snapshot = { ...entry.snapshot, refreshing: true, error: null };
  entry.request = Promise.resolve().then(load).then((data) => {
    if (entries.get(key) !== entry) return;
    entry.snapshot = { data, hasData: true, refreshing: false, error: null };
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
  entries.set(key, { snapshot: { data: update(current.data as T), hasData: true, refreshing: false, error: null } });
  notify(key);
}

// Clear on logout; in-flight responses cannot repopulate the new session.
export function clearClientQueryCache() {
  const keys = [...entries.keys()];
  entries.clear();
  keys.forEach(notify);
}
