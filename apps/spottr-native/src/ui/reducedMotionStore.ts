type MotionSource = {
  read(): Promise<boolean>;
  listen(change: (value: boolean) => void): () => void;
};

/** One system subscription for every button, sheet and screen in the app. */
export function createReducedMotionStore(source: MotionSource) {
  let value = false, initialized = false, revision = 0;
  let disconnect: (() => void) | undefined;
  const subscribers = new Set<() => void>();
  const publish = (next: boolean) => {
    if (value === next) return;
    value = next;
    subscribers.forEach(listener => listener());
  };
  return {
    initialize(initial: boolean) {
      if (!initialized) { initialized = true; value = initial; }
    },
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      subscribers.add(listener);
      if (subscribers.size === 1) {
        const generation = ++revision;
        let changed = false;
        disconnect = source.listen(next => {
          if (generation !== revision) return;
          changed = true;
          publish(next);
        });
        void source.read().then(next => {
          // A late initial read must not overwrite a newer accessibility event.
          if (generation === revision && !changed) publish(next);
        }).catch(() => {});
      }
      return () => {
        if (!subscribers.delete(listener) || subscribers.size) return;
        revision++;
        disconnect?.();
        disconnect = undefined;
      };
    },
  };
}
