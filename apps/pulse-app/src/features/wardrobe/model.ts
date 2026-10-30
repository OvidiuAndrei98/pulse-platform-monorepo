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
  const plural = ro
      ? ["haine", "genți", "rucsacuri"]
      : ["coats", "bags", "backpacks"],
    singular = ro ? ["haină", "geantă", "rucsac"] : ["coat", "bag", "backpack"];
  return itemKeys
    .flatMap((key, index) =>
      items[key]
        ? [
            `${items[key]} ${items[key] === 1 ? singular[index] : plural[index]}`,
          ]
        : [],
    )
    .join(" · ");
}
export function depositedSince(
  deposit: Pick<Deposit, "storedAt" | "createdAt">,
  ro: boolean,
  now = Date.now(),
) {
  const stamp = Date.parse(deposit.storedAt ?? deposit.createdAt);
  if (!Number.isFinite(stamp)) return "";
  const minutes = Math.max(0, Math.floor((now - stamp) / 60000));
  if (minutes < 1) return ro ? "Depozitat acum" : "Checked in just now";
  const days = Math.floor(minutes / 1440),
    hours = Math.floor(minutes / 60);
  const value = days || hours || minutes;
  const unit = days
    ? ro
      ? days === 1
        ? "zi"
        : "zile"
      : days === 1
        ? "day"
        : "days"
    : hours
      ? ro
        ? hours === 1
          ? "oră"
          : "ore"
        : hours === 1
          ? "hour"
          : "hours"
      : "min";
  return ro
    ? `Depozitat de ${value} ${unit}`
    : `Checked in ${value} ${unit} ago`;
}
export const wardrobeText = (ro: boolean) =>
  ro
    ? {
        title: "Garderobă",
        mine: "Obiectele mele",
        staff: "Personal garderobă",
        hint: "Un singur QR. Hainele tale, la locul lor.",
        open: "Deschide garderoba",
        active: "Ai obiecte la garderobă",
        empty: "Nu ai obiecte depozitate.",
        emptyHint:
          "Arată QR-ul contului la garderoba evenimentului. Depozitarea va apărea aici.",
        code: "QR-ul contului",
        event: "Eveniment",
        zone: "Zona ghișeului",
        select: "Alege",
        noEvents: "Nu ai încă evenimente cu acces la garderobă.",
        operations: "Depozitări",
        unclaimed: "Neridicate",
        unclaimedHint:
          "Obiectele rămase după încheierea acestui eveniment, începând cu cele depozitate cel mai demult. Se păstrează până la predare.",
        unclaimedEmpty: "Nu au rămas obiecte neridicate.",
        unclaimedPending:
          "Obiectele neridicate vor apărea aici după încheierea evenimentului.",
        unclaimedSummary: (count: number, items: number) =>
          `${count} ${count === 1 ? "depozitare" : "depozitări"} · ${items} ${items === 1 ? "obiect rămas" : "obiecte rămase"}`,
        setup: "Configurare",
        history: "Istoric",
        retentionHint:
          "Depozitările încheiate și istoricul lor se șterg automat la 7 zile după eveniment. Pentru ridicările întârziate, termenul este de 7 zile de la predare. Obiectele neridicate și datele necesare recuperării lor se păstrează.",
        scan: "Scanează contul",
        scanHint:
          "Alege zona și obiectele, apoi scanează QR-ul clientului. Numărul se atribuie automat.",
        coat: "Haine",
        bag: "Genți",
        backpack: "Rucsacuri",
        any: "Haine și bagaje",
        full: "Nu există locuri libere pentru această selecție.",
        free: "locuri libere",
        store: "Depozitat",
        storeHint:
          "Pune obiectele la acest număr, apoi confirmă. Rezervarea locului expiră în 5 minute.",
        cancel: "Anulează rezervarea",
        reserved: "Loc rezervat",
        stored: "La garderobă",
        returned: "Predat",
        cancelled: "Anulat",
        close: "Închide",
        back: "Înapoi",
        refresh: "Actualizează",
        syncPaused: "Sincronizarea în fundal este întreruptă. Verifică internetul sau apasă Actualizează.",
        add: "Adaugă alte obiecte",
        addHint:
          "Alege doar obiectele noi. Acestea primesc un loc separat, fără să modifice depozitarea existentă.",
        reserveMore: "Rezervă loc pentru obiectele noi",
        move: "Schimbă locul",
        moveHint:
          "Se atribuie următorul loc liber din zona aleasă. Mută fizic obiectele la noul număr.",
        pickup: "Cere confirmarea ridicării",
        pickupHint:
          "Selectează obiectele de predat. Clientul confirmă în Garderobă, din contul lui.",
        waiting: "Așteptăm confirmarea clientului",
        approved: "Clientul a confirmat. Poți preda obiectele.",
        handover: "Obiectele au fost predate",
        approve: "Confirm ridicarea",
        decline: "Nu ridic acum",
        confirmHint:
          "Confirmă doar dacă ești la garderobă și vrei să ridici obiectele de mai jos.",
        confirmed: "Confirmat. Personalul îți va preda obiectele.",
        recover: "Recuperare asistată",
        recoveryHint:
          "Doar responsabilul poate preda fără confirmarea din aplicație. Verifică dreptul de ridicare și descrie verificarea făcută. Nu introduce date din acte.",
        reason: "Cum ai verificat dreptul de ridicare?",
        recoverConfirm: "Am verificat și am predat obiectele",
        search: "Caută numele sau numărul",
        next: "Mai multe",
        noDeposits: "Nicio depozitare în această listă.",
        online:
          "Operațiunile necesită internet. Dacă nu primești confirmarea, verifică înregistrarea înainte de a preda obiectele.",
        zoneName: "Numele zonei",
        prefix: "Prefix (A, B...)",
        capacity: "Număr de locuri",
        kind: "Tip de obiecte",
        createZone: "Creează zona",
        zonesHint:
          "Etichetează locurile fizice cu aceleași numere. După creare, prefixul, tipul și numerele rămân fixe.",
        disable: "Oprește depozitările noi",
        enable: "Permite depozitări noi",
        email: "Emailul contului angajatului",
        operator: "Operator",
        supervisor: "Responsabil",
        addStaff: "Acordă acces",
        remove: "Retrage accesul",
        team: "Echipă",
        audit: "Ultimele operațiuni",
        unknown: "Cont șters",
        offline:
          "Nu am putut actualiza garderoba. Verifică internetul și încearcă din nou.",
        error:
          "Operațiunea nu a fost confirmată. Actualizează înainte de a încerca din nou.",
        retry: "Încearcă din nou",
        loading: "Se încarcă...",
        permission: "Permite accesul la cameră",
        cameraError:
          "Camera nu este disponibilă. Verifică permisiunea în setări.",
        closed:
          "Evenimentul nu mai acceptă depozitări noi. Obiectele existente pot fi ridicate.",
        invalidQR: "Acesta nu este QR-ul unui cont SPOTTR.",
        changed:
          "Înregistrarea s-a modificat. Am actualizat datele; verifică înainte de a continua.",
        invalidItems: "Alege între 1 și 20 de obiecte, din cele disponibile.",
        access: "Nu mai ai acces la garderoba acestui eveniment.",
        staffMissing: "Nu există un cont activ cu acest email.",
        reasonRequired: "Descrie verificarea în cel puțin 12 caractere.",
        zoneInvalid:
          "Completează numele, prefixul (1–8 litere A–Z) și între 1 și 2.000 de locuri.",
      }
    : {
        title: "Cloakroom",
        mine: "My belongings",
        staff: "Cloakroom staff",
        hint: "One QR. Your belongings, in their place.",
        open: "Open cloakroom",
        active: "Your belongings are at the cloakroom",
        empty: "No belongings checked in.",
        emptyHint:
          "Show your account QR at the event cloakroom. Your deposit will appear here.",
        code: "Account QR",
        event: "Event",
        zone: "Desk zone",
        select: "Choose",
        noEvents: "You do not have access to any cloakroom events yet.",
        operations: "Deposits",
        unclaimed: "Unclaimed",
        unclaimedHint:
          "Belongings left after this event ended, with the oldest check-ins first. Records stay available until handover.",
        unclaimedEmpty: "No unclaimed belongings remain.",
        unclaimedPending:
          "Unclaimed belongings will appear here after the event ends.",
        unclaimedSummary: (count: number, items: number) =>
          `${count} ${count === 1 ? "deposit" : "deposits"} · ${items} ${items === 1 ? "item remaining" : "items remaining"}`,
        setup: "Setup",
        history: "History",
        retentionHint:
          "Completed deposits and their history are automatically deleted 7 days after the event. Late collections are kept for 7 days after handover. Unclaimed belongings and the records needed to recover them are retained.",
        scan: "Scan account",
        scanHint:
          "Choose a zone and items, then scan the customer QR. A free number is assigned automatically.",
        coat: "Coats",
        bag: "Bags",
        backpack: "Backpacks",
        any: "Coats and bags",
        full: "No free places for this selection.",
        free: "free places",
        store: "Checked in",
        storeHint:
          "Place the belongings at this number, then confirm. The place reservation expires after 5 minutes.",
        cancel: "Cancel reservation",
        reserved: "Place reserved",
        stored: "At the cloakroom",
        returned: "Collected",
        cancelled: "Cancelled",
        close: "Close",
        back: "Back",
        refresh: "Refresh",
        syncPaused: "Background sync is interrupted. Check your connection or select Refresh.",
        add: "Check in more items",
        addHint:
          "Choose only the new items. These receive a separate place; the existing deposit stays unchanged.",
        reserveMore: "Reserve a place for the new items",
        move: "Change place",
        moveHint:
          "The next free place in the selected zone is assigned. Move the belongings to the new number.",
        pickup: "Request collection approval",
        pickupHint:
          "Select the items to hand over. The customer approves in Cloakroom from their own account.",
        waiting: "Waiting for customer approval",
        approved: "Customer approved. You can hand over the items.",
        handover: "Items handed over",
        approve: "Approve collection",
        decline: "Not collecting now",
        confirmHint:
          "Only approve if you are at the cloakroom and want to collect the items below.",
        confirmed: "Approved. Staff will hand over your belongings.",
        recover: "Assisted recovery",
        recoveryHint:
          "Only a supervisor can hand over without in-app approval. Verify the right to collect and describe your checks. Do not enter ID document details.",
        reason: "How did you verify the right to collect?",
        recoverConfirm: "I verified and handed over the items",
        search: "Search name or number",
        next: "More",
        noDeposits: "No deposits in this list.",
        online:
          "Operations require internet. If confirmation does not arrive, check the record before handing over belongings.",
        zoneName: "Zone name",
        prefix: "Prefix (A, B...)",
        capacity: "Number of places",
        kind: "Item type",
        createZone: "Create zone",
        zonesHint:
          "Label physical places with the same numbers. Prefix, item type and numbering stay fixed after creation.",
        disable: "Stop new deposits",
        enable: "Allow new deposits",
        email: "Staff account email",
        operator: "Operator",
        supervisor: "Supervisor",
        addStaff: "Grant access",
        remove: "Revoke access",
        team: "Team",
        audit: "Recent activity",
        unknown: "Deleted account",
        offline:
          "Could not update the cloakroom. Check your connection and try again.",
        error: "The operation was not confirmed. Refresh before trying again.",
        retry: "Try again",
        loading: "Loading...",
        permission: "Allow camera access",
        cameraError: "Camera is unavailable. Check its permission in settings.",
        closed:
          "This event no longer accepts new deposits. Existing belongings can still be collected.",
        invalidQR: "This is not a SPOTTR account QR.",
        changed:
          "The record changed. We refreshed it; check before continuing.",
        invalidItems: "Choose between 1 and 20 available items.",
        access: "You no longer have access to this event cloakroom.",
        staffMissing: "No active account has this email.",
        reasonRequired: "Describe your checks using at least 12 characters.",
        zoneInvalid:
          "Enter a name, prefix (1–8 letters A–Z) and between 1 and 2,000 places.",
      };
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
