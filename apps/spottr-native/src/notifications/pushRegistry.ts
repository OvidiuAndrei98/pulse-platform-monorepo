export type PushRegistration = { token: string; secret: string; userId: string; projectId: string };
export type PushIdentity = { userId: string; token: string; language: 'ro' | 'en' };
export type PushDevice = { token: string; projectId: string; platform: 'ios' | 'android' };
type Dependencies = {
  read(): Promise<PushRegistration | null>;
  write(value: PushRegistration | null): Promise<void>;
  secret(): string;
  register(value: PushRegistration & PushDevice & { language: string }, identity: PushIdentity): Promise<void>;
  unregister(value: PushRegistration): Promise<void>;
};

/** A single queue owns registration and its durable revocation journal. A stale
 * login/permission result can never attach a phone after logout. */
export class PushRegistry {
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly deps: Dependencies) {}
  invalidate() { this.generation++; }
  sync(identity: PushIdentity | null, getDevice: () => Promise<PushDevice | null>): Promise<boolean> {
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    const job = async () => {
      if (!current()) return false;
      let saved = await this.deps.read();
      if (!current()) return false;
      // Revoke the previous account before asking the OS/network for a new token.
      if (saved && saved.userId !== identity?.userId) {
        await this.deps.unregister(saved);
        await this.deps.write(null); saved = null;
      }
      if (!identity || !current()) return false;
      const device = await getDevice();
      if (!current()) return false;
      if (saved && (!device || device.token !== saved.token || device.projectId !== saved.projectId)) {
        await this.deps.unregister(saved);
        await this.deps.write(null); saved = null;
      }
      if (!device || !current()) return false;
      let entry = saved ?? { token: device.token, projectId: device.projectId, userId: identity.userId, secret: this.deps.secret() };
      // Save first: even an ambiguous timeout/termination can be revoked later.
      await this.deps.write(entry);
      if (!current()) return false;
      try {
        await this.deps.register({ ...entry, ...device, language: identity.language }, identity);
      } catch (error) {
        // A previous offline logout may already have revoked this credential,
        // while its successful response was lost. Renew only for this login.
        if (!current() || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'PUSH_REGISTRATION_REVOKED') throw error;
        entry = { ...entry, secret: this.deps.secret() };
        await this.deps.write(entry);
        if (!current()) return false;
        await this.deps.register({ ...entry, ...device, language: identity.language }, identity);
      }
      if (!current()) {
        await this.deps.unregister(entry);
        await this.deps.write(null);
        return false;
      }
      return true;
    };
    const result = this.queue.catch(() => undefined).then(job);
    this.queue = result;
    return result;
  }
}

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export function pushNotificationID(data: unknown, userId: string | undefined, projectId: string): string | null {
  if (!data || typeof data !== 'object' || !userId || !projectId) return null;
  const row = data as Record<string, unknown>;
  return row.kind === 'spottr_notification' && row.userId === userId && row.projectId === projectId &&
    typeof row.notificationId === 'string' && uuid.test(row.notificationId) ? row.notificationId : null;
}

export function parsePushRegistration(raw: string | null): PushRegistration | null {
  if (!raw) return null;
  const row = JSON.parse(raw) as PushRegistration;
  if (!row || typeof row.token !== 'string' || !/^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{16,200}\]$/.test(row.token) ||
    typeof row.secret !== 'string' || !/^[a-f\d]{64}$/.test(row.secret) || !uuid.test(row.userId) || !uuid.test(row.projectId)) {
    throw new Error('Invalid push registration');
  }
  return row;
}
