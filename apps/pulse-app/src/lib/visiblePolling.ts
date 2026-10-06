/** Completion-based polling: no overlap, no hidden/offline traffic, bounded backoff. */
export function startVisiblePolling(
  refresh: () => Promise<unknown>,
  intervalMs: number,
) {
  let stopped = false;
  let running = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visible = () => document.visibilityState === "visible" && navigator.onLine;
  const schedule = () => {
    if (stopped || !visible()) return;
    const delay = Math.min(intervalMs * 2 ** failures, 120_000);
    timer = setTimeout(run, delay * (1 + Math.random() * 0.2));
  };
  const run = async () => {
    clearTimeout(timer);
    if (stopped || running || !visible()) return;
    running = true;
    try {
      const ok = await refresh();
      failures = ok === false ? Math.min(failures + 1, 5) : 0;
    } catch {
      failures = Math.min(failures + 1, 5);
    } finally {
      running = false;
      schedule();
    }
  };
  const wake = () => { if (!visible()) clearTimeout(timer); else void run(); };
  window.addEventListener("online", wake);
  window.addEventListener("offline", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("online", wake);
    window.removeEventListener("offline", wake);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}
