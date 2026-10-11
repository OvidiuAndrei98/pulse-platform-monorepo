import type { components } from "@packages/api-client/src/schema";
import { ApiError } from "../data/http";

export type Account = components["schemas"]["CurrentUser"] & {
  preferredLanguage?: "ro" | "en";
};
export type AccountPatch = Pick<
  Partial<Account>,
  "username" | "bio" | "preferredLanguage" | "showAttendancePublicly"
>;
export type SessionState = {
  ready: boolean;
  busy: boolean;
  user: Account | null;
  offline: boolean;
  storageError: boolean;
  error: boolean;
};
export type SessionStorage = {
  read: () => Promise<string | null>;
  write: (value: string | null) => Promise<void>;
};
export type SessionApi = {
  login: (email: string, password: string) => Promise<{ token: string }>;
  me: (token: string) => Promise<unknown>;
  update: (token: string, patch: AccountPatch) => Promise<unknown>;
};
export function parseAccount(value: unknown): Account {
  if (!value || typeof value !== "object")
    throw new ApiError(0, "INVALID_RESPONSE");
  const row = value as Account;
  if (
    typeof row.id !== "string" ||
    !row.id ||
    typeof row.username !== "string" ||
    typeof row.email !== "string" ||
    !["user", "organizer", "admin"].includes(row.role) ||
    typeof row.hasPassword !== "boolean"
  )
    throw new ApiError(0, "INVALID_RESPONSE");
  return row;
}

/** All durable writes share a queue; every async completion belongs to a generation. */
export class SessionController {
  private state: SessionState = {
    ready: false,
    busy: false,
    user: null,
    offline: false,
    storageError: false,
    error: false,
  };
  private token: string | null = null;
  private generation = 0;
  private listeners = new Set<() => void>();
  private writes: Promise<void> = Promise.resolve();
  private updates: Promise<unknown> = Promise.resolve();
  private hydration?: Promise<void>;
  constructor(
    private storage: SessionStorage,
    private api: SessionApi,
    private identityChanged: () => void = () => {},
  ) {}
  getSnapshot = () => this.state;
  getToken = () => this.token;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private persist(value: string | null, generation: number) {
    const task = this.writes
      .catch(() => {})
      .then(() => this.storage.write(value));
    this.writes = task;
    return task.then(
      () => {
        if (generation === this.generation)
          this.publish({ storageError: false });
      },
      () => {
        if (generation === this.generation)
          this.publish({ storageError: true });
      },
    );
  }
  hydrate() {
    return (this.hydration ??= this.hydrateOnce().finally(() => {
      this.hydration = undefined;
    }));
  }
  private async hydrateOnce() {
    const generation = this.generation;
    if (this.state.ready) return;
    try {
      const raw = await this.storage.read();
      if (generation !== this.generation || !raw) return;
      let stored: { token: string; user: Account };
      try {
        stored = JSON.parse(raw);
        if (typeof stored.token !== "string" || !stored.token)
          throw new Error();
        stored.user = parseAccount(stored.user);
      } catch {
        await this.persist(null, generation);
        return;
      }
      this.token = stored.token;
      try {
        const user = parseAccount(await this.api.me(stored.token));
        if (generation !== this.generation) return;
        this.identityChanged();
        this.publish({ user, offline: false, error: false });
        await this.persist(
          JSON.stringify({ token: stored.token, user }),
          generation,
        );
      } catch (error) {
        if (generation !== this.generation) return;
        if (
          error instanceof ApiError &&
          [401, 403, 404].includes(error.status)
        ) {
          await this.logout();
        } else if (
          !(error instanceof ApiError) ||
          error.status >= 500 ||
          error.status === 429 ||
          error.code === "TIMEOUT"
        ) {
          this.identityChanged();
          this.publish({ user: stored.user, offline: true });
        } else this.publish({ error: true });
      }
    } catch {
      if (generation === this.generation) this.publish({ storageError: true });
    } finally {
      if (generation === this.generation) this.publish({ ready: true });
    }
  }
  async login(email: string, password: string) {
    return this.authenticate(() => this.api.login(email.trim(), password));
  }
  async acceptOAuthToken(token: string) {
    return this.authenticate(async () => ({ token }));
  }
  private async authenticate(getToken: () => Promise<{ token: string }>) {
    const generation = ++this.generation;
    this.publish({ busy: true });
    try {
      const result = await getToken();
      if (generation !== this.generation) return false;
      if (typeof result.token !== "string" || !result.token)
        throw new ApiError(0, "INVALID_RESPONSE");
      const user = parseAccount(await this.api.me(result.token));
      if (generation !== this.generation) return false;
      this.identityChanged();
      this.token = result.token;
      this.publish({ user, ready: true, offline: false, error: false });
      await this.persist(
        JSON.stringify({ token: this.token, user }),
        generation,
      );
      return generation === this.generation;
    } finally {
      if (generation === this.generation)
        this.publish({ busy: false, ready: true });
    }
  }
  logout = async () => {
    const generation = ++this.generation;
    this.token = null;
    this.identityChanged();
    this.publish({
      user: null,
      ready: true,
      busy: false,
      offline: false,
      error: false,
    });
    await this.persist(null, generation);
  };
  expire = (requestToken: string) => {
    if (requestToken === this.token) void this.logout();
  };
  refresh() {
    const generation = this.generation,
      token = this.token,
      id = this.state.user?.id;
    const task = this.updates
      .catch(() => {})
      .then(async () => {
        if (!token || generation !== this.generation) return null;
        let user: Account;
        try {
          user = parseAccount(await this.api.me(token));
        } catch (cause) {
          if (
            generation === this.generation &&
            token === this.token &&
            cause instanceof ApiError &&
            [401, 403, 404].includes(cause.status)
          )
            await this.logout();
          throw cause;
        }
        if (generation !== this.generation) return null;
        if (user.id !== id) throw new ApiError(0, "INVALID_RESPONSE");
        this.publish({ user, offline: false });
        await this.persist(JSON.stringify({ token, user }), generation);
        return generation === this.generation ? user : null;
      });
    this.updates = task;
    return task;
  }
  cancelPendingLogin() {
    if (!this.state.busy || this.state.user) return;
    this.generation++;
    this.publish({ busy: false, ready: true });
  }
  update = (patch: AccountPatch): Promise<Account | null> => {
    const generation = this.generation,
      token = this.token,
      userId = this.state.user?.id;
    const task = this.updates
      .catch(() => {})
      .then(async () => {
        if (!token || generation !== this.generation) return null;
        const user = parseAccount(await this.api.update(token, patch));
        if (generation !== this.generation) return null;
        if (user.id !== userId) throw new ApiError(0, "INVALID_RESPONSE");
        this.publish({ user, offline: false });
        await this.persist(JSON.stringify({ token, user }), generation);
        return generation === this.generation ? user : null;
      });
    this.updates = task;
    return task;
  };
}

export function validPassword(password: string) {
  // bcrypt's input limit is bytes, including multibyte characters and emoji.
  const bytes = new TextEncoder().encode(password).length;
  return bytes >= 8 && bytes <= 72;
}
