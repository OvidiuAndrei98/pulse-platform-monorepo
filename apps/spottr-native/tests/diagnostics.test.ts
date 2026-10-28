import test from "node:test";
import assert from "node:assert/strict";
import {
  reportError,
  parseReport,
  parseErrorPage,
  screenName,
  safeVersion,
  type ErrorReport,
} from "../../pulse-app/src/features/diagnostics/report";
import { createErrorReporter } from "../src/diagnostics/reporter";
import { groupDiagnosticReports } from '../../pulse-app/src/features/diagnostics/presentation';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const metadata = {
  platform: "ios" as const,
  appVersion: "1.0.0",
  buildVersion: "12",
  osVersion: "26.0",
};
const timestamp = Date.parse("2026-10-12T12:00:00Z");
const context = {
  ...metadata,
  id: id(1),
  occurredAt: new Date(timestamp).toISOString(),
  fatal: false,
  screen: "Home" as const,
  breadcrumbs: ["Home"],
};
const error = (n = 1) => ({
  name: "TypeError",
  message: "Cannot read properties of undefined",
  stack: `TypeError: private value\n    at showTicket (https://host.test/private/index.bundle?token=secret:${n}:24)`,
});
const makeReport = (n = 1): ErrorReport =>
  reportError(error(n), { ...context, id: id(n) });

test('handled fields are strictly bounded and cannot carry raw context', () => {
  const report = { ...makeReport(), operation: 'tickets_load', failure: 'server_error', httpStatus: 503 };
  assert.equal(parseReport({ ...report, accountId: 'private' }).operation, 'tickets_load');
  for (const patch of [{ operation: '/users/private/tickets' }, { failure: 'private' }, { httpStatus: 200 }, { httpStatus: 600 }, { httpStatus: '503' }, { operation: undefined }, { failure: undefined }])
    assert.throws(() => parseReport({ ...report, ...patch }));
  assert.equal(JSON.stringify(parseReport({ ...report, accountId: 'private' })).includes('private'), false);
});

test('handled retries from different call sites deduplicate while independent operations remain visible', async () => {
  const h = harness();
  await h.reporter.capture(error(1), false, false, { operation: 'tickets_load', failure: 'server_error', httpStatus: 503 });
  await h.reporter.capture(error(2), false, false, { operation: 'tickets_load', failure: 'server_error', httpStatus: 503 });
  await h.reporter.capture(error(3), false, false, { operation: 'scanner_sync', failure: 'server_error', httpStatus: 503 });
  assert.equal(h.sent.length, 2);
  h.advance(300001);
  await h.reporter.capture(error(4), false, false, { operation: 'tickets_load', failure: 'server_error', httpStatus: 503 });
  assert.equal(h.sent.length, 3);
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test('Admin groups loaded repetitions, ignores overlapping page IDs and preserves the latest report', () => {
  const first = { ...makeReport(1), receivedAt: new Date(timestamp).toISOString(), fingerprint: 'a'.repeat(64) };
  const later = { ...first, id: id(2), receivedAt: new Date(timestamp + 1000).toISOString() };
  const other = { ...first, id: id(3), fingerprint: 'b'.repeat(64) };
  const rows = [first, later, other, first];
  const groups = groupDiagnosticReports(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { report: later, count: 2 });
  assert.equal(rows.length, 4, 'export input is not mutated');
});

function harness(
  initial: unknown = [],
  send?: (
    report: ErrorReport,
  ) => Promise<{ status: number; retryAfter?: number }>,
) {
  let clock = timestamp,
    nextId = 100,
    data = JSON.stringify(initial);
  const sent: ErrorReport[] = [];
  const reporter = createErrorReporter({
    metadata,
    now: () => clock,
    id: () => id(nextId++),
    storage: {
      read: async () => data,
      write: async (value) => {
        data = value;
      },
    },
    send: async (report) => {
      sent.push(report);
      return send ? send(report) : { status: 204 };
    },
  });
  return {
    reporter,
    sent,
    stored: () => JSON.parse(data) as ErrorReport[],
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

test("report removes raw messages, URLs, user fields, causes and credential-looking stack symbols", () => {
  const report = reportError(
    {
      ...error(),
      message:
        "Cannot read properties of undefined email=person@example.test Bearer value",
      token: "private-token",
      cause: new Error("secret"),
      stack:
        error().stack +
        "\n at sk_test_private (https://private.test/sk_test_private.js:9:8)",
    },
    context,
  );
  assert.equal(report.category, "property_access");
  assert.deepEqual(report.frames, [
    { file: "index.bundle", function: "showTicket", line: 1, column: 24 },
    { file: "unknown", function: "anonymous", line: 9, column: 8 },
  ]);
  const raw = JSON.stringify(report);
  for (const secret of [
    "person@",
    "Bearer",
    "private-token",
    "secret",
    "https:",
    "sk_test",
    "cause",
    "message",
  ])
    assert.equal(raw.includes(secret), false, secret);
});

test("Hermes stack offsets survive and frames are bounded", () => {
  const report = reportError(
    {
      name: "Error",
      stack:
        "Error: hidden\n" +
        Array.from(
          { length: 30 },
          (_, n) =>
            `    at anonymous (address at index.ios.bundle:1:${n + 20})`,
        ).join("\n"),
    },
    context,
  );
  assert.equal(report.frames.length, 12);
  assert.deepEqual(report.frames[0], {
    file: "index.ios.bundle",
    function: "anonymous",
    line: 1,
    column: 20,
  });
});

test("empty and unexpected thrown values do not escape the reporting schema", () => {
  for (const value of [null, undefined, "", "private error", 0, {}, []]) {
    assert.deepEqual(parseReport(reportError(value, context)), {
      ...context,
      errorType: "Unknown",
      category: "unknown",
      frames: [],
    });
  }
  assert.equal(screenName("NestedEvent:private-event-id"), "Event");
  assert.equal(screenName("/users/me?token=private"), "Unknown");
  assert.equal(safeVersion("https://private.test"), "unknown");
  assert.equal(reportError({}, context, true).category, "render_exception");
});

test("persisted reports reject malformed fields and strip unknown properties", () => {
  const valid = makeReport();
  for (const patch of [
    { id: "" },
    { occurredAt: 2026 },
    { occurredAt: "bad" },
    { platform: "desktop" },
    { appVersion: "token=secret" },
    { screen: "Event/private" },
    { fatal: "true" },
    { breadcrumbs: ["private"] },
    { breadcrumbs: Array(9).fill("Home") },
    { frames: Array(13).fill(valid.frames[0]) },
    { frames: [{ ...valid.frames[0], line: -1 }] },
    { frames: [{ ...valid.frames[0], line: 1.5 }] },
    { frames: [{ ...valid.frames[0], function: undefined }] },
  ]) {
    assert.throws(
      () => parseReport({ ...valid, ...patch }),
      /INVALID_DIAGNOSTIC/,
    );
  }
  assert.deepEqual(
    parseReport({
      ...valid,
      message: "sensitive",
      frames: [{ ...valid.frames[0], url: "secret" }],
    }),
    valid,
  );
  for (const value of [null, undefined, 42, "", []])
    assert.throws(() => parseReport(value));
});

test("admin pages reject invalid response shapes", () => {
  const row = {
    ...makeReport(),
    receivedAt: context.occurredAt,
    fingerprint: "a".repeat(64),
  };
  assert.deepEqual(parseErrorPage({ items: [row], nextCursor: "" }).items, [
    row,
  ]);
  for (const page of [
    null,
    [],
    { items: [row] },
    { items: Array(26).fill(row), nextCursor: "" },
    { items: [{ ...row, receivedAt: 2026 }], nextCursor: "" },
    { items: [{ ...row, fingerprint: "raw stack" }], nextCursor: "" },
  ])
    assert.throws(() => parseErrorPage(page));
});

test("offline captures persist sanitized reports and retry the same IDs after restart", async () => {
  const offline = harness([], async () => {
    throw Error("offline");
  });
  offline.reporter.setScreen("Checkout");
  await offline.reporter.capture(error(), true);
  assert.equal(offline.stored().length, 1);
  assert.deepEqual(offline.stored()[0]!.breadcrumbs, ["Checkout"]);
  const restarted = harness(offline.stored());
  await restarted.reporter.flush();
  assert.equal(restarted.sent[0]!.id, offline.sent[0]!.id);
  assert.deepEqual(restarted.stored(), []);
});

test("retry respects rate-limit Retry-After, then drains successfully", async () => {
  let status = 429;
  const h = harness([], async () => ({ status, retryAfter: 120 }));
  await h.reporter.capture(error());
  await h.reporter.flush();
  h.advance(119000);
  await h.reporter.flush();
  assert.equal(h.sent.length, 1);
  status = 204;
  h.advance(1000);
  await h.reporter.flush();
  assert.equal(h.sent.length, 2);
  assert.deepEqual(h.stored(), []);
});

test("permanent schema failures do not block subsequent reports", async () => {
  const h = harness([makeReport(1), makeReport(2)], async (report) => ({
    status: report.id === id(1) ? 400 : 204,
  }));
  await h.reporter.flush();
  assert.equal(h.sent.length, 2);
  assert.deepEqual(h.stored(), []);
});

test("duplicate errors are suppressed and a burst is bounded to ten reports per hour", async () => {
  const h = harness();
  await Promise.all(
    Array.from({ length: 30 }, () => h.reporter.capture(error())),
  );
  assert.equal(h.sent.length, 1);
  for (let i = 2; i <= 30; i++) await h.reporter.capture(error(i));
  assert.equal(h.sent.length, 10);
  h.advance(3600000);
  await h.reporter.capture(error(31));
  assert.equal(h.sent.length, 11);
});

test("single-flight send does not lose reports captured while another is pending", async () => {
  let release!: () => void,
    active = 0,
    peak = 0;
  const block = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = harness([], async () => {
    active++;
    peak = Math.max(peak, active);
    await block;
    active--;
    return { status: 204 };
  });
  const first = h.reporter.capture(error(1));
  await tick();
  const second = h.reporter.capture(error(2));
  const flush = h.reporter.flush();
  await tick();
  release();
  await Promise.all([first, second, flush]);
  await h.reporter.flush();
  assert.equal(peak, 1);
  assert.equal(h.sent.length, 2);
  assert.deepEqual(h.stored(), []);
});

test("corrupt/expired/future storage rows are ignored and queue size stays bounded", async () => {
  const rows = Array.from({ length: 23 }, (_, i) => makeReport(i + 1));
  const h = harness([
    ...rows,
    null,
    { ...makeReport(30), occurredAt: "2020-01-01T00:00:00Z" },
    { ...makeReport(31), occurredAt: "2030-01-01T00:00:00Z" },
  ]);
  await h.reporter.flush();
  assert.equal(h.sent.length, 17);
  assert.deepEqual(h.stored(), []);
});

test("storage rejection never propagates and an in-memory report can still be delivered", async () => {
  const sent: ErrorReport[] = [];
  const h = createErrorReporter({
    metadata,
    id: () => id(1),
    now: () => timestamp,
    storage: {
      read: async () => {
        throw Error("unavailable");
      },
      write: async () => {
        throw Error("full");
      },
    },
    send: async (report) => {
      sent.push(report);
      return { status: 204 };
    },
  });
  await h.capture(error());
  assert.equal(sent.length, 1);
  await h.flush();
  assert.equal(sent.length, 1);
});

test("expired-only storage is cleared even when nothing remains to transmit", async () => {
  const h = harness([{ ...makeReport(), occurredAt: "2020-01-01T00:00:00Z" }]);
  await h.reporter.flush();
  assert.deepEqual(h.stored(), []);
  assert.equal(h.sent.length, 0);
});

test("reports expiring while the app stays open are removed from storage", async () => {
  const h = harness([], async () => { throw Error("offline"); });
  await h.reporter.capture(error());
  assert.equal(h.stored().length, 1);
  h.advance(7 * 86400000);
  await h.reporter.flush();
  assert.deepEqual(h.stored(), []);
  assert.equal(h.sent.length, 1);
});

test("iOS main.jsbundle offsets remain usable without exposing filesystem paths", () => {
  const report = reportError({ name: "Error", stack: "Error: private\n    at render (address at /var/mobile/private/main.jsbundle:1:2084)" }, context);
  assert.deepEqual(report.frames, [{ file: "main.jsbundle", function: "anonymous", line: 1, column: 2084 }]);
  assert.deepEqual(parseReport(report), report);
});
