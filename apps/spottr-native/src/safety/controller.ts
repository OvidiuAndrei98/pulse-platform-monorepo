import { ApiError } from '../data/http';
import { canSafetyAction, type createSafetyApi, type SafetyAction, type SafetyEnvelope } from './data';

export type SafetyFailure = { key: string; message?: string };
export type SafetyState = { data: SafetyEnvelope | null; pending: boolean; working: boolean; connectionLost: boolean; error: SafetyFailure | null; actionError: SafetyFailure | null; notice: string | null };
function failure(cause: unknown, key: string): SafetyFailure {
  // The Go API returns user-facing validation errors, whereas transport codes
  // such as TIMEOUT/INVALID_RESPONSE use translated feedback instead.
  return { key, ...(cause instanceof ApiError && cause.status >= 400 && /\s/.test(cause.code) ? { message: cause.code } : {}) };
}
export class SafetyController {
  private state: SafetyState = { data: null, pending: true, working: false, connectionLost: false, error: null, actionError: null, notice: null };
  private listeners = new Set<() => void>();
  private active = false;
  private generation = 0;
  private read: AbortController | null = null;
  private write: AbortController | null = null;
  constructor(readonly eventId: string, readonly viewer: string, readonly token: string, private api: ReturnType<typeof createSafetyApi>, private sameSession: () => boolean) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<SafetyState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(v => v()); }
  private current(generation: number) { return this.active && generation === this.generation && this.sameSession(); }
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this.generation++;
      this.read?.abort(); this.write?.abort(); this.read = this.write = null;
      this.update({ working: false, pending: !this.state.data });
    } else { void this.load(!!this.state.data); }
  }
  /** A background poll never competes with an action or another read. */
  poll = () => this.state.data?.group?.currentMemberStatus === 'accepted' && !this.state.working ? this.load(true, true) : Promise.resolve(false);
  async load(quiet = false, background = false): Promise<boolean> {
    if (!this.active || !this.sameSession() || (background && (this.read || this.write))) return false;
    this.read?.abort();
    const controller = new AbortController(), generation = this.generation;
    this.read = controller;
    if (!quiet) this.update({ pending: true, error: null });
    const current = () => this.current(generation) && this.read === controller && !controller.signal.aborted;
    try {
      const data = await this.api.load(this.eventId, this.token, controller.signal);
      if (!current()) return false;
      this.update({ data, error: null, connectionLost: false });
      return true;
    } catch (cause) {
      if (current()) this.update({ connectionLost: true, ...(!quiet ? { error: failure(cause, 'safetyGroup.loadFailed') } : {}) });
      return false;
    } finally {
      if (current()) { this.read = null; this.update({ pending: false }); }
    }
  }
  async run(action: SafetyAction): Promise<boolean> {
    if (!this.active || !this.sameSession() || this.write || !canSafetyAction(this.state.data, action, this.viewer)) return false;
    this.read?.abort(); this.read = null;
    const controller = new AbortController(), generation = this.generation;
    this.write = controller;
    this.update({ working: true, actionError: null, notice: null });
    const current = () => this.current(generation) && this.write === controller && !controller.signal.aborted;
    try {
      await this.api.change(this.eventId, action, this.token, controller.signal);
      if (!current()) return false;
      this.update({ notice: ({ create: 'safetyGroup.created', invite: 'safetyGroup.invitesSent', help: 'safetyGroup.helpSent' } as Partial<Record<SafetyAction['kind'], string>>)[action.kind] ?? null });
      await this.load(true);
      return current();
    } catch (cause) {
      if (current()) this.update({ actionError: failure(cause, ({ create: 'safetyGroup.createFailed', invite: 'safetyGroup.inviteFailed', respond: 'safetyGroup.responseFailed', help: 'safetyGroup.helpFailed', messages: 'safetyGroup.sendFailed', 'help-resolved': 'safetyGroup.sendFailed' })[action.kind]) });
      return false;
    } finally { if (current()) { this.write = null; this.update({ working: false }); } }
  }
}
