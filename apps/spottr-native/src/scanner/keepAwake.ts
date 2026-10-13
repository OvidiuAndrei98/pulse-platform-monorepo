/** The unique tag prevents a late release from disabling a newly opened scanner. */
let sequence = 0;
export function holdScannerAwake(adapter: { activate(tag: string): Promise<void>; deactivate(tag: string): Promise<void> }, changed: (awake: boolean) => void) {
  const tag = `spottr-scanner-${++sequence}`;
  let released = false;
  const release = () => { void adapter.deactivate(tag).catch(() => {}); };
  void adapter.activate(tag).then(() => { if (released) release(); else changed(true); }).catch(() => { if (!released) changed(false); });
  return () => { released = true; release(); };
}
