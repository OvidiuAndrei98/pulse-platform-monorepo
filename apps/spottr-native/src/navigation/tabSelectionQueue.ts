/** Commit a tab without waiting for another display frame; cancellation stays explicit. */
export function createTabCommitScheduler() {
  let serial = 0;
  const pending = new Map<number, () => void>();
  return {
    schedule(callback: () => void) {
      const id = ++serial;
      pending.set(id, callback);
      queueMicrotask(() => {
        const task = pending.get(id);
        pending.delete(id);
        task?.();
      });
      return id;
    },
    cancel(id: number) { pending.delete(id); },
  };
}

/** Collapse queued touches to the latest selection before React changes a page. */
export function createTabSelectionQueue<T>(commit: (value: T) => void,
  schedule: (callback: () => void) => number, cancel: (id: number) => void) {
  let frame: number | null = null, pending: { value: T } | null = null;
  return {
    select(value: T) {
      pending = { value };
      if (frame !== null) return;
      frame = schedule(() => {
        frame = null;
        const latest = pending;
        pending = null;
        if (latest) commit(latest.value);
      });
    },
    clear() {
      if (frame !== null) cancel(frame);
      frame = null; pending = null;
    },
  };
}
