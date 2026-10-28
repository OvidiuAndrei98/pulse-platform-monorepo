import { captureHandledFailure, requestOperation } from '../diagnostics/handled';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

type SessionAccess = {
  token: () => string | null;
  expire: (token: string) => void;
};
let session: SessionAccess = { token: () => null, expire: () => {} };
export function bindSession(access: SessionAccess) {
  session = access;
}

/** Optional bearer auth also matters on public event/social/profile responses. */
export const authorizedFetch: typeof fetch = async (input, options = {}) => {
  const token = session.token();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(input, { ...options, headers });
  if (response.status === 401 && token) session.expire(token);
  return response;
};

export function createHttp(
  base: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000,
) {
  return async function request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      body?: unknown;
      binary?: BodyInit;
      contentType?: string;
      signal?: AbortSignal;
      token?: string | null;
      expireSession?: boolean;
      idempotencyKey?: string;
    } = {},
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("://"))
      throw new ApiError(0, "INVALID_PATH");
    const token = options.token === undefined ? session.token() : options.token;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort();
    }, timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
      if (options.binary !== undefined)
        headers["Content-Type"] =
          options.contentType ?? "application/octet-stream";
      else if (options.body !== undefined)
        headers["Content-Type"] = "application/json";
      const response = await fetcher(base.replace(/\/+$/, "") + path, {
        method: options.method ?? "GET",
        headers,
        signal: controller.signal,
        body:
          options.binary ??
          (options.body === undefined
            ? undefined
            : JSON.stringify(options.body)),
      });
      if (response.status === 204) return undefined as T;
      let data: unknown;
      try {
        data = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (response.ok) throw new ApiError(0, "INVALID_RESPONSE");
      }
      if (!response.ok) {
        // A bad login or deletion password is not an expired account session.
        if (
          response.status === 401 &&
          token &&
          options.expireSession !== false &&
          !path.startsWith("/auth/") &&
          !(path === "/users/me" && options.method === "DELETE")
        )
          session.expire(token);
        const row =
          data && typeof data === "object"
            ? (data as Record<string, unknown>)
            : {};
        throw new ApiError(
          response.status,
          typeof row.code === "string"
            ? row.code
            : typeof row.error === "string"
              ? row.error
              : "HTTP_ERROR",
        );
      }
      return data as T;
    } catch (error) {
      if (timedOut) throw new ApiError(0, "TIMEOUT");
      const operation = requestOperation(path);
      if (operation && !options.signal?.aborted) captureHandledFailure(error, operation);
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  };
}
