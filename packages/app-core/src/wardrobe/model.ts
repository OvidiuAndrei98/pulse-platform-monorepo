import { resources } from '../i18n/resources';
import { translate } from '../i18n/translate';
// Shared by Next.js and React Native. Custody and allocation are server-owned.
export type Items = { coat: number; bag: number; backpack: number };
export const itemKeys = ["coat", "bag", "backpack"] as const;
export const emptyItems = (): Items => ({ coat: 0, bag: 0, backpack: 0 });
export const totalItems = (i: Items) => i.coat + i.bag + i.backpack;
export type Zone = {
  id: string;
  name: string;
  prefix: string;
  kind: "any" | "coat" | "bag";
  capacity: number;
  enabled: boolean;
  revision: number;
  occupied: number;
};
export type Deposit = {
  id: string;
  eventId: string;
  eventTitle: string;
  userId: string | null;
  customerName: string;
  zoneId: string;
  zoneName: string;
  number: string;
  status: "reserved" | "stored" | "returned" | "cancelled";
  items: Items;
  remaining: Items;
  revision: number;
  reservedUntil: string;
  createdAt: string;
  storedAt: string | null;
  returnedAt: string | null;
  pickupId: string | null;
  pickupItems: Items | null;
  pickupExpiresAt: string | null;
  pickupApproved: boolean | null;
};
export type WardrobeEvent = { id: string; title: string; canManage: boolean; startTime?:string; endTime?:string; status?:string; location?:string };
export type Mine = { deposits: Deposit[]; staffAccess: boolean };
export type Overview = {
  eventId: string;
  title: string;
  canManage: boolean;
  canRecover: boolean;
  accepting: boolean;
  eventEnded: boolean;
  unclaimedCount: number;
  unclaimedItems: number;
  zones: Zone[];
  staff: { id: string; name: string; role: "operator" | "supervisor" }[];
  deposits: Deposit[];
  nextCursor: string;
  audit: {
    id: string;
    action: string;
    actor: string;
    depositId: string | null;
    details: { reason?: string; items?: Items };
    at: string;
  }[];
};
export type Command = {
  action:
    | "lookup"
    | "reserve"
    | "store"
    | "cancel"
    | "move"
    | "request-pickup"
    | "return"
    | "recover"
    | "zone"
    | "staff"
    | "remove-staff";
  code?: string;
  zoneId?: string;
  depositId?: string;
  requestId?: string;
  revision?: number;
  items?: Items;
  additional?: boolean;
  pickupId?: string;
  reason?: string;
  name?: string;
  prefix?: string;
  kind?: string;
  capacity?: number;
  enabled?: boolean;
  email?: string;
  role?: string;
  userId?: string;
};
export type Request = <T>(
  path: string,
  options?: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal },
) => Promise<T>;
export function readProfileQR(code: string) {
  return (
    /^(?:glow|pulse):\/\/friend\/([\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12})$/i
      .exec(code.trim())?.[1]
      ?.toLowerCase() ?? null
  );
}
export function fitsZone(items: Items, zone: Zone) {
  return (
    zone.enabled &&
    (zone.kind === "any" ||
      (zone.kind === "coat" && items.bag + items.backpack === 0) ||
      (zone.kind === "bag" && items.coat === 0))
  );
}
export function pickupActive(d: Deposit, now = Date.now()) {
  return (
    d.status === "stored" &&
    !!d.pickupId &&
    !!d.pickupExpiresAt &&
    Date.parse(d.pickupExpiresAt) > now
  );
}
export function itemsText(items: Items, ro: boolean) {
  return itemKeys.filter(key => items[key]).map(key =>
    `${items[key]} ${translate(ro ? "ro" : "en", "wardrobe.items." + key, { count: items[key] })}`
  ).join(" · ");
}
export function depositedSince(deposit: Pick<Deposit, "storedAt" | "createdAt">, ro: boolean, now = Date.now()) {
  const stamp = Date.parse(deposit.storedAt ?? deposit.createdAt);
  if (!Number.isFinite(stamp)) return "";
  const language = ro ? "ro" : "en";
  const minutes = Math.max(0, Math.floor((now - stamp) / 60000));
  if (minutes < 1) return translate(language, "wardrobe.elapsed.now");
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes / 60);
  const value = days || hours || minutes;
  const unit = translate(language, "wardrobe.elapsed." + (days ? "day" : hours ? "hour" : "minute"), { count: value });
  return translate(language, "wardrobe.elapsed.ago", { value, unit });
}
/** Compatibility view model: all wording is owned by the shared i18n resources. */
export function wardrobeText(ro: boolean) {
  const language = ro ? "ro" : "en";
  return {
    ...resources[language].translation.wardrobe,
    unclaimedSummary: (count: number, items: number) =>
      translate(language, "wardrobe.deposits", { count }) + " · " +
      translate(language, "wardrobe.unclaimedItems", { count: items }),
  };
}
export function wardrobeError(cause: unknown, ro: boolean) {
  const c = wardrobeText(ro),
    code = String(
      (cause as { code?: string; message?: string })?.code ||
        (cause as Error)?.message ||
        "",
    );
  if (wardrobeAccessFailure(cause)) return c.access;
  if (/INVALID_QR/.test(code)) return c.invalidQR;
  if (/CHANGED|EXPIRED|REQUEST_REUSED|CONFLICT/.test(code)) return c.changed;
  if (/FULL/.test(code)) return c.full;
  if (/INVALID_ITEMS|WRONG_ZONE/.test(code)) return c.invalidItems;
  if (
    /ACCESS_DENIED|MANAGER_REQUIRED|SUPERVISOR_REQUIRED|UNAUTHORIZED/.test(code)
  )
    return c.access;
  if (/STAFF_NOT_FOUND|CUSTOMER_NOT_FOUND/.test(code)) return c.staffMissing;
  if (/RECOVERY_REASON/.test(code)) return c.reasonRequired;
  if (/INVALID_ZONE|ZONE_LIMIT/.test(code)) return c.zoneInvalid;
  if (/CONFIRMATION_REQUIRED/.test(code)) return c.waiting;
  if (/EVENT_CLOSED/.test(code)) return c.closed;
  return c.error;
}
export function actionLabel(action: string, ro: boolean) {
  const c = wardrobeText(ro);
  const labels: Record<string, string> = {
    reserve: c.reserved,
    store: c.store,
    cancel: c.cancelled,
    expired: c.cancelled,
    move: c.move,
    "request-pickup": c.pickup,
    return: c.handover,
    recover: c.recover,
    "customer-confirm": c.approve,
    zone: c.zone,
    staff: c.addStaff,
    "remove-staff": c.remove,
  };
  return labels[action] ?? c.audit;
}

function wardrobeAccessFailure(error: unknown): boolean {
  const failure = error as { status?: number; code?: string; message?: string } | null;
  return failure?.status === 401 || failure?.status === 403 ||
    /ACCESS_DENIED|UNAUTHORIZED/.test(`${failure?.code ?? ''} ${failure?.message ?? ''}`);
}

type State = {
  mine?: Mine;
  events: WardrobeEvent[];
  eventId: string;
  overview?: Overview;
  selected?: Deposit;
  busy: boolean;
  loading: boolean;
  syncError: unknown;
  error: unknown;
  search: string;
  history: boolean;
  unclaimed: boolean;
  cursor: string;
};
export class WardrobeStore {
  private pendingReservation?: { fingerprint: string; id: string };
  private state: State = {
    events: [],
    eventId: "",
    busy: false,
    loading: false,
    syncError: null,
    error: null,
    search: "",
    history: false,
    unclaimed: false,
    cursor: "",
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private reading = false;
  private readTask?: Promise<void>;
  private readForeground = false;
  private readStaff = false;
  private errorFromRead = false;
  private queuedStaff?: { epoch: number; foreground: boolean; task: Promise<void> };
  private disposed = false;
  private lifetime = new AbortController();
  constructor(private transport: Request, private options: { personal?: boolean; autoSelectFirst?: boolean } = {}) {}
  private request: Request = (path, options = {}) =>
    this.transport(path, { ...options, signal: this.lifetime.signal });
  start = () => {
    if (this.disposed) {
      this.disposed = false;
      this.lifetime = new AbortController();
      this.reading = false;
      this.set({ busy: false, loading: false });
    }
  };
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.state;
  private set(patch: Partial<State>, source?: "read") {
    if (!this.disposed) {
      if ("error" in patch) this.errorFromRead = source === "read";
      this.state = { ...this.state, ...patch };
      this.listeners.forEach((fn) => fn());
    }
  }
  dispose = () => {
    this.disposed = true;
    this.epoch++;
    this.lifetime.abort();
  };
  refresh(staff = false, options: { background?: boolean } = {}): Promise<void> {
    if ((!staff && this.options.personal === false) || this.state.busy || this.disposed)
      return Promise.resolve();
    if (this.reading) {
      // A deliberate refresh joins the live read rather than racing it.
      if (!options.background && !this.readForeground) {
        this.readForeground = true;
        this.set({ loading: true });
      }
      if (staff && !this.readStaff) {
        if (this.queuedStaff?.epoch === this.epoch) {
          this.queuedStaff.foreground ||= !options.background;
          return this.queuedStaff.task;
        }
        const queued = { epoch: this.epoch, foreground: !options.background, task: Promise.resolve() };
        this.queuedStaff = queued;
        queued.task = (this.readTask ?? Promise.resolve()).then(() => {
          if (queued.epoch !== this.epoch || this.disposed) return;
          return this.refresh(true, { background: !queued.foreground });
        });
        const clearQueued = () => { if (this.queuedStaff === queued) this.queuedStaff = undefined; };
        void queued.task.then(clearQueued, clearQueued);
        return queued.task;
      }
      return this.readTask ?? Promise.resolve();
    }
    this.reading = true;
    this.readForeground = !options.background;
    this.readStaff = staff;
    const epoch = this.epoch;
    const task = Promise.resolve().then(() => {
      if (epoch !== this.epoch || this.disposed) return;
      return this.readRefresh(staff, epoch);
    });
    this.readTask = task;
    if (this.readForeground) this.set({ loading: true });
    const clearTask = () => {
      if (this.readTask === task) this.readTask = undefined;
    };
    void task.then(clearTask, clearTask);
    return task;
  }
  private async readRefresh(staff: boolean, epoch: number) {
    try {
      if (this.options.personal !== false) {
        const mine = await this.request<Mine>("/wardrobe/mine");
        if (epoch !== this.epoch || this.disposed) return;
        this.set({ mine });
      }
      if (staff) {
        const events = await this.request<WardrobeEvent[]>("/wardrobe/events");
        if (epoch !== this.epoch || this.disposed) return;
        this.set({ events });
        if (!this.state.eventId && events[0] && this.options.autoSelectFirst !== false)
          this.set({ eventId: events[0].id });
        if (this.state.eventId) {
          const { eventId, search, history, unclaimed, cursor, selected } =
            this.state;
          const page = (before: string) =>
            this.request<Overview>(
              `/wardrobe/events/${eventId}?q=${encodeURIComponent(search)}&history=${history}&unclaimed=${unclaimed}&before=${before}`,
            );
          let currentCursor = cursor;
          let overview = await page(cursor);
          if (epoch !== this.epoch || this.disposed) return;
          // Retention may remove a pagination anchor (or every remaining row
          // after it). Return to the first page once, instead of getting stuck
          // on an empty page whose cursor can never resolve again.
          if (cursor && overview.deposits.length === 0) {
            overview = await page("");
            currentCursor = "";
            if (epoch !== this.epoch || this.disposed) return;
          }
          let refreshedSelected: Deposit | undefined;
          if (selected) {
            try {
              const result = await this.request<{ deposit: Deposit }>(
                `/wardrobe/events/${eventId}/deposits/${selected.id}`,
              );
              refreshedSelected = result.deposit;
            } catch (error) {
              const failure = error as { code?: string; message?: string };
              // Only the API's specific missing-deposit response is expected
              // after retention. Network errors and revoked access still fail.
              if ((failure?.code ?? failure?.message) !== "WARDROBE_NOT_FOUND")
                throw error;
            }
          }
          if (epoch !== this.epoch || this.disposed) return;
          this.set({
            overview,
            selected: refreshedSelected,
            cursor: currentCursor,
          });
        }
      }
      if (epoch === this.epoch && !this.disposed) {
        // Recover read errors automatically without dismissing a failed custody operation.
        const clearError = this.readForeground || this.errorFromRead;
        if (clearError || this.state.syncError)
          this.set({ syncError: null, ...(clearError ? { error: null } : {}) });
      }
    } catch (error) {
      if (epoch === this.epoch && !this.disposed) {
        const forbidden = wardrobeAccessFailure(error);
        this.set({
          ...(this.readForeground || forbidden
            ? { error, syncError: null }
            : { syncError: error }),
          ...(forbidden
            ? {
                overview: undefined,
                selected: undefined,
                mine: undefined,
                events: [],
                eventId: "",
                search: "",
                cursor: "",
                history: false,
                unclaimed: false,
              }
            : {}),
        }, "read");
      }
    } finally {
      if (epoch === this.epoch) {
        this.reading = false;
        if (this.state.loading) this.set({ loading: false });
      }
    }
  }
  async change(
    patch: Partial<
      Pick<State, "eventId" | "search" | "history" | "unclaimed" | "cursor">
    >,
  ) {
    if (this.state.busy) return;
    this.epoch++;
    this.reading = false;
    const eventChanged =
      patch.eventId !== undefined && patch.eventId !== this.state.eventId;
    this.set({
      ...patch,
      // A different event must not inherit an invisible search from the
      // previous desk. An explicitly supplied query still takes precedence.
      search: patch.search ?? (eventChanged ? "" : this.state.search),
      overview: undefined,
      selected: undefined,
      cursor: patch.cursor ?? "",
      error: null,
    });
    await this.refresh(true);
  }
  select = (selected?: Deposit) => {
    if (this.state.busy) return;
    this.epoch++;
    this.reading = false;
    this.set({ selected, loading: false });
  };
  async reserve(
    code: string,
    zoneId: string,
    items: Items,
    additional: boolean,
    makeId: () => string,
  ) {
    if (this.state.busy) return null;
    if (!readProfileQR(code)) {
      this.set({ error: new Error("WARDROBE_INVALID_QR") });
      return null;
    }
    const fingerprint = JSON.stringify([
      this.state.eventId,
      code,
      zoneId,
      items,
      additional,
    ]);
    if (this.pendingReservation?.fingerprint !== fingerprint)
      this.pendingReservation = { fingerprint, id: makeId() };
    const result = await this.command({
      action: "reserve",
      code,
      zoneId,
      items,
      additional,
      requestId: this.pendingReservation.id,
    });
    if (result) this.pendingReservation = undefined;
    return result;
  }
  async command(command: Command) {
    if (this.state.busy || this.disposed || !this.state.eventId) return null;
    const epoch = ++this.epoch,
      event = this.state.eventId;
    this.reading = false;
    this.set({ busy: true, loading: false, error: null, ...(command.action === 'lookup' ? {selected:undefined} : {}) });
    let result: { deposit?: Deposit; deposits?: Deposit[] } | null = null;
    try {
      result = await this.request(`/wardrobe/events/${event}/commands`, {
        method: "POST",
        body: command,
      });
      if (epoch !== this.epoch || this.disposed) return null;
      // Lookup is read-only. Never publish an implicit customer selection while
      // the following refresh is still running; callers choose eligible rows.
      if (command.action !== 'lookup') {
        if (result?.deposit) this.set({ selected: result.deposit });
        else if (result?.deposits?.length)
          this.set({ selected: result.deposits[0] });
      }
    } catch (error) {
      if (epoch === this.epoch) this.set({ error });
    } finally {
      if (epoch === this.epoch) this.set({ busy: false });
    }
    const error = this.state.error;
    await this.refresh(true, { background: true });
    if (epoch !== this.epoch || this.disposed || event !== this.state.eventId) return null;
    if (error && epoch === this.epoch) this.set({ error });
    return result;
  }
  async approve(deposit: Deposit, approve: boolean) {
    if (this.state.busy || this.disposed || !deposit.pickupId) return;
    const epoch = ++this.epoch;
    this.reading = false;
    this.set({ busy: true, loading: false, error: null });
    try {
      await this.request(`/wardrobe/mine/${deposit.id}/confirm`, {
        method: "POST",
        body: { pickupId: deposit.pickupId, approve },
      });
    } catch (error) {
      if (epoch === this.epoch) this.set({ error });
    } finally {
      if (epoch === this.epoch) this.set({ busy: false });
    }
    const error = this.state.error;
    await this.refresh(false, { background: true });
    if (error && epoch === this.epoch) this.set({ error });
  }
}
