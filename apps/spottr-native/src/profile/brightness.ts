type AnimationClock = {
  now: () => number;
  schedule: (callback: () => void, delay: number) => () => void;
};
const defaultClock: AnimationClock = {
  now: () => performance.now(),
  schedule: (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
};
const TRANSITION_MS = 350;

export class BrightnessManager {
  private leases = 0;
  private foreground = true;
  private previous: number | null = null;
  private current: number | null = null;
  private queue = Promise.resolve();
  private wake: (() => void) | null = null;
  constructor(
    private api: {
      get: () => Promise<number>;
      set: (value: number) => Promise<void>;
    },
    private clock: AnimationClock = defaultClock,
  ) {}
  private wanted() {
    return this.leases > 0 && this.foreground;
  }
  private frame() {
    return new Promise<void>(resolve => {
      const finish = () => {
        cancel();
        this.wake = null;
        resolve();
      };
      const cancel = this.clock.schedule(finish, 16);
      this.wake = finish;
    });
  }
  private async write(value: number) {
    // Await native writes so slow devices cannot accumulate stale brightness
    // commands that would run after the sheet has already closed.
    await this.api.set(value);
    this.current = value;
  }
  private async transition(target: number, boosting: boolean) {
    if (this.wanted() !== boosting) return false;
    const from = this.current ?? target;
    if (!this.foreground || from === target) {
      // Background restoration cannot depend on timers: iOS can suspend JS.
      // Always acknowledge cleanup, even after a rejected native write.
      if (!boosting || from !== target) await this.write(target);
      return true;
    }
    const started = this.clock.now();
    while (this.wanted() === boosting) {
      await this.frame();
      if (this.wanted() !== boosting) return false;
      if (!this.foreground) {
        await this.write(target);
        return true;
      }
      const progress = Math.max(0, Math.min(1, (this.clock.now() - started) / TRANSITION_MS));
      const eased = progress * progress * (3 - 2 * progress);
      await this.write(progress === 1 ? target : from + (target - from) * eased);
      if (progress === 1) return true;
    }
    return false;
  }
  private reconcile() {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        if (this.wanted()) {
          if (this.previous === null) {
            const value = await this.api.get();
            if (!Number.isFinite(value) || value < 0 || value > 1)
              throw new Error('Invalid screen brightness');
            this.previous = this.current = value;
          }
          if (this.wanted() && await this.transition(1, true)) return;
        }
        if (!this.wanted() && this.previous !== null && await this.transition(this.previous, false)) {
          this.previous = null;
          this.current = null;
        }
      });
    this.queue = task;
    return task;
  }
  acquire() {
    const wasWanted = this.wanted();
    this.leases++;
    if (this.wanted() !== wasWanted) this.wake?.();
    return this.reconcile();
  }
  release() {
    const wasWanted = this.wanted();
    this.leases = Math.max(0, this.leases - 1);
    if (this.wanted() !== wasWanted) this.wake?.();
    return this.reconcile();
  }
  setForeground(value: boolean) {
    const changed = this.foreground !== value;
    this.foreground = value;
    if (changed) this.wake?.();
    return this.reconcile();
  }
}
