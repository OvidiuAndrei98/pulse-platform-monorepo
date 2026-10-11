/** Feedback must never delay or reject the action that triggered it. */
export function createHapticFeedback<T extends string>(
  effects: Record<T, () => Promise<void>>,
  now: () => number = Date.now,
) {
  let last = -Infinity;
  return (effect: T) => {
    const time = now();
    if (time - last < 80) return;
    last = time;
    try { void effects[effect]().catch(() => undefined); } catch { /* Unsupported device/module. */ }
  };
}
