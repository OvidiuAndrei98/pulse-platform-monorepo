export const screens = [
  "Unknown",
  "Home",
  "Explore",
  "Feed",
  "Profile",
  "Tabs",
  "FeedHome",
  "FriendsManage",
  "ProfileHome",
  "SavedEvents",
  "Tickets",
  "Orders",
  "Event",
  "EventDetails",
  "Search",
  "PublicProfile",
  "Legal",
  "SafetyGroup",
  "Dashboard",
  "Scanner",
  "Admin",
  "QuickScanner",
  "Checkout",
  "CheckoutReturn",
  "Auth",
] as const;
export const errorTypes = [
  "Error",
  "TypeError",
  "ReferenceError",
  "RangeError",
  "SyntaxError",
  "InvariantViolation",
  "Unknown",
] as const;
export const categories = [
  "property_access",
  "undefined_identifier",
  "invalid_hook",
  "render_exception",
  "network",
  "timeout",
  "unknown",
] as const;
export const operations = [
  'api_request', 'tickets_load', 'tickets_storage', 'orders_load',
  'payment_prepare', 'payment_confirm', 'payment_present', 'payment_storage',
  'payment_ticket_delivery', 'scanner_events', 'scanner_prepare',
  'scanner_validate', 'scanner_sync', 'scanner_storage',
] as const;
export const failureKinds = ['server_error', 'invalid_response', 'storage_error', 'sdk_error', 'configuration', 'fulfillment_missing'] as const;
export type HandledFailure = {
  operation: (typeof operations)[number];
  failure: (typeof failureKinds)[number];
  httpStatus?: number;
};
export type ErrorReport = {
  id: string;
  occurredAt: string;
  platform: "ios" | "android" | "web";
  appVersion: string;
  buildVersion: string;
  osVersion: string;
  errorType: (typeof errorTypes)[number];
  category: (typeof categories)[number];
  fatal: boolean;
  screen: (typeof screens)[number];
  breadcrumbs: string[];
  frames: { file: string; function: string; line: number; column: number }[];
} & Partial<HandledFailure>;
export type ErrorEntry = ErrorReport & {
  receivedAt: string;
  fingerprint: string;
};
export type ErrorPage = { items: ErrorEntry[]; nextCursor: string };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const version = /^(unknown|[0-9][0-9A-Za-z.+_-]{0,39})$/;
const symbol = /^[A-Za-z_$][A-Za-z0-9_.$<> -]{0,79}$/;
const file = /^[A-Za-z0-9_.-]{1,80}\.(js|jsx|ts|tsx|bundle|jsbundle|hbc)$/;
const secret = /secret|bearer|sk_|pk_|rk_|cs_|pi_|eyJ|[a-f0-9]{24}/i;
const timestamp = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(
    value,
  ) &&
  Number.isFinite(Date.parse(value));
export const screenName = (value: unknown): ErrorReport["screen"] =>
  typeof value === "string" && value.startsWith("NestedEvent:")
    ? "Event"
    : screens.includes(value as never)
      ? (value as ErrorReport["screen"])
      : "Unknown";
export const safeVersion = (value: unknown) =>
  typeof value === "string" && version.test(value) ? value : "unknown";
export function reportError(
  error: unknown,
  context: Omit<ErrorReport, "errorType" | "category" | "frames">,
  render = false,
): ErrorReport {
  const value =
    error && typeof error === "object"
      ? (error as { name?: unknown; message?: unknown; stack?: unknown })
      : {};
  const message =
    typeof value.message === "string" ? value.message.slice(0, 2000) : "";
  const category: ErrorReport["category"] =
    /cannot read propert|undefined is not an object|null is not an object/i.test(
      message,
    )
      ? "property_access"
      : /is not defined|can't find variable/i.test(message)
        ? "undefined_identifier"
        : /invalid hook|rendered (more|fewer) hooks/i.test(message)
          ? "invalid_hook"
          : /network request failed|failed to fetch/i.test(message)
            ? "network"
            : /timed? ?out/i.test(message)
              ? "timeout"
              : render
                ? "render_exception"
                : "unknown";
  const frames: ErrorReport["frames"] = [];
  if (typeof value.stack === "string")
    for (const line of value.stack.slice(0, 16000).split("\n").slice(1, 30)) {
      const match = line.match(
        /(?:at\s+(?:address at )?(.*?)\s*\()?([^\s()]+):(\d+):(\d+)\)?$/,
      );
      if (!match) continue;
      const name = (match[1] ?? "").trim(),
        basename = match[2]!.split(/[\\/]/).pop()!.split("?")[0]!;
      frames.push({
        file:
          file.test(basename) && !secret.test(basename) ? basename : "unknown",
        function: symbol.test(name) && !secret.test(name) ? name : "anonymous",
        line: Math.min(100000000, Number(match[3])),
        column: Math.min(100000000, Number(match[4])),
      });
      if (frames.length === 12) break;
    }
  // Deliberately discard message/cause/custom properties. Redacting arbitrary
  // error strings cannot reliably exclude QR credentials or billing details.
  return {
    ...context,
    errorType: errorTypes.includes(value.name as never)
      ? (value.name as ErrorReport["errorType"])
      : "Unknown",
    category,
    frames,
  };
}
export function parseReport(value: unknown): ErrorReport {
  const r = value as ErrorReport;
  if (
    !r ||
    typeof r.id !== "string" ||
    !uuid.test(r.id) ||
    !timestamp(r.occurredAt) ||
    !["ios", "android", "web"].includes(r.platform) ||
    ![r.appVersion, r.buildVersion, r.osVersion].every(
      (v) => typeof v === "string" && version.test(v),
    ) ||
    !errorTypes.includes(r.errorType) ||
    !categories.includes(r.category) ||
    typeof r.fatal !== "boolean" ||
    !screens.includes(r.screen) ||
    !Array.isArray(r.breadcrumbs) ||
    r.breadcrumbs.length > 8 ||
    r.breadcrumbs.some((s) => !screens.includes(s as never)) ||
    !Array.isArray(r.frames) ||
    r.frames.length > 12
  )
    throw Error("INVALID_DIAGNOSTIC");
  const handled = r.operation !== undefined || r.failure !== undefined || r.httpStatus !== undefined;
  if (handled && (!operations.includes(r.operation as never) || !failureKinds.includes(r.failure as never)
    || r.httpStatus !== undefined && (!Number.isInteger(r.httpStatus) || r.httpStatus < 500 || r.httpStatus > 599)))
    throw Error('INVALID_DIAGNOSTIC');
  for (const frame of r.frames)
    if (
      !frame ||
      typeof frame.file !== "string" ||
      typeof frame.function !== "string" ||
      (frame.file !== "unknown" && !file.test(frame.file)) ||
      (frame.function !== "anonymous" && !symbol.test(frame.function)) ||
      secret.test(frame.file) ||
      secret.test(frame.function) ||
      ![frame.line, frame.column].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 100000000,
      )
    )
      throw Error("INVALID_DIAGNOSTIC");
  // Reconstruct rather than forwarding unknown persisted/network properties.
  return {
    id: r.id,
    occurredAt: r.occurredAt,
    platform: r.platform,
    appVersion: r.appVersion,
    buildVersion: r.buildVersion,
    osVersion: r.osVersion,
    errorType: r.errorType,
    category: r.category,
    fatal: r.fatal,
    ...(handled ? { operation: r.operation, failure: r.failure, ...(r.httpStatus !== undefined ? { httpStatus: r.httpStatus } : {}) } : {}),
    screen: r.screen,
    breadcrumbs: [...r.breadcrumbs],
    frames: r.frames.map((f) => ({
      file: f.file,
      function: f.function,
      line: f.line,
      column: f.column,
    })),
  };
}
export function parseErrorPage(value: unknown): ErrorPage {
  const page = value as ErrorPage;
  if (
    !page ||
    !Array.isArray(page.items) ||
    page.items.length > 25 ||
    typeof page.nextCursor !== "string" ||
    page.nextCursor.length > 256
  )
    throw Error("INVALID_DIAGNOSTICS_PAGE");
  return {
    nextCursor: page.nextCursor,
    items: page.items.map((row) => {
      if (
        !row ||
        !timestamp(row.receivedAt) ||
        typeof row.fingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(row.fingerprint)
      )
        throw Error("INVALID_DIAGNOSTICS_PAGE");
      return {
        ...parseReport(row),
        receivedAt: row.receivedAt,
        fingerprint: row.fingerprint,
      };
    }),
  };
}
