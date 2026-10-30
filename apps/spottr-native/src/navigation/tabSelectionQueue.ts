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
