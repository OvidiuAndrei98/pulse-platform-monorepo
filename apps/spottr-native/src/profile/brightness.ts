export class BrightnessManager {
  private leases = 0;
  private foreground = true;
  private previous: number | null = null;
  private queue = Promise.resolve();
  constructor(
    private api: {
      get: () => Promise<number>;
      set: (value: number) => Promise<void>;
    },
  ) {}
  private reconcile() {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        const wanted = () => this.leases > 0 && this.foreground;
        if (wanted()) {
          if (this.previous === null) this.previous = await this.api.get();
          if (wanted()) {
            await this.api.set(1);
            return;
          }
        }
        if (this.previous !== null) {
          await this.api.set(this.previous);
          this.previous = null;
        }
      });
    this.queue = task;
    return task;
  }
  acquire() {
    this.leases++;
    return this.reconcile();
  }
  release() {
    this.leases = Math.max(0, this.leases - 1);
    return this.reconcile();
  }
  setForeground(value: boolean) {
    this.foreground = value;
    return this.reconcile();
  }
}
