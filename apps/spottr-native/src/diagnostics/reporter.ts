import {
  parseReport,
  reportError,
  screenName,
  type ErrorReport,
  type HandledFailure,
} from "../../../pulse-app/src/features/diagnostics/report";
type Storage = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
};
type Metadata = Pick<
  ErrorReport,
  "platform" | "appVersion" | "buildVersion" | "osVersion"
>;
export function createErrorReporter(options: {
  storage: Storage;
  metadata: Metadata;
  id(): string;
  send(report: ErrorReport): Promise<{ status: number; retryAfter?: number }>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let queue: ErrorReport[] = [],
    writes: Promise<unknown> = Promise.resolve(),
    flushing: Promise<void> | undefined;
  let screen: ErrorReport["screen"] = "Unknown",
    breadcrumbs: string[] = [],
    retryAt = 0,
    failures = 0;
  const seen = new Map<string, number>();
  let accepted: number[] = [];
  const recent = (report: ErrorReport) =>
    now() - Date.parse(report.occurredAt) < 7 * 86400000 &&
    Date.parse(report.occurredAt) <= now() + 300000;
  const ready = Promise.resolve()
    .then(() => options.storage.read())
    .then(async (raw) => {
      if (!raw) return;
      try {
        const rows: unknown = raw.length <= 262144 ? JSON.parse(raw) : [];
        if (Array.isArray(rows))
          for (const row of rows.slice(-20))
            try {
              const report = parseReport(row);
              if (recent(report) && !queue.some((q) => q.id === report.id))
                queue.push(report);
            } catch {
              /* Drop corrupt records. */
            }
      } catch {
        /* Corrupt JSON is discarded without reporting another error. */
      }
      // Remove expired/corrupt data from disk, even if there are no new errors.
      await options.storage.write(JSON.stringify(queue));
    })
    .catch(() => {});
  const serial = <T>(task: () => Promise<T>) => {
    const next = writes.catch(() => {}).then(task);
    writes = next;
    return next;
  };
  const persist = () =>
    options.storage.write(JSON.stringify(queue)).catch(() => {});
  function flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = (async () => {
      await ready;
      if (now() < retryAt) return;
      for (let i = 0; i < 20; i++) {
        const item = await serial(async () => {
          const previousCount = queue.length;
          queue = queue.filter(recent);
          if (queue.length !== previousCount) await persist();
          return queue[0];
        });
        if (!item) return;
        let result: { status: number; retryAfter?: number };
        try {
          result = await options.send(item);
        } catch {
          result = { status: 0 };
        }
        if (
          (result.status >= 200 && result.status < 300) ||
          [400, 413, 422].includes(result.status)
        ) {
          await serial(async () => {
            queue = queue.filter((row) => row.id !== item.id);
            await persist();
          });
          failures = 0;
          retryAt = 0;
        } else {
          failures++;
          retryAt =
            now() +
            Math.max(
              Math.min(300000, 5000 * 2 ** Math.min(failures, 6)),
              Math.min(900000, (result.retryAfter ?? 0) * 1000),
            );
          return;
        }
      }
    })()
      .catch(() => {})
      .finally(() => {
        flushing = undefined;
      });
    return flushing;
  }
  return {
    setScreen(value: unknown) {
      const next = screenName(value);
      if (next === screen) return;
      screen = next;
      breadcrumbs = [...breadcrumbs, next].slice(-8);
    },
    async capture(error: unknown, fatal = false, render = false, detail?: HandledFailure) {
      try {
        const report = reportError(
          error,
          {
            ...options.metadata,
            id: options.id(),
            occurredAt: new Date(now()).toISOString(),
            fatal,
            screen,
            breadcrumbs: [...breadcrumbs],
            ...(detail ? { operation: detail.operation, failure: detail.failure, httpStatus: detail.httpStatus } : {}),
          },
          render,
        );
        const key = JSON.stringify([
          report.screen,
          report.errorType,
          report.category,
          // Handled retries can come from different call sites. Group by the
          // operation/reason instead of producing a new report for each stack.
          report.operation ? [report.operation, report.failure, report.httpStatus] : report.frames,
        ]);
        accepted = accepted.filter((at) => now() - at < 3600000);
        for (const [key, at] of seen)
          if (now() - at >= 300000) seen.delete(key);
        if (seen.has(key) || accepted.length >= 10) return;
        seen.set(key, now());
        accepted.push(now());
        await ready;
        await serial(async () => {
          queue = [...queue.filter(recent), parseReport(report)].slice(-20);
          await persist();
        });
        await flush();
      } catch {
        /* Reporting must never break the application or report itself. */
      }
    },
    flush,
  };
}
