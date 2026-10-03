import {
  applyOfflineSyncResults, getPendingOfflineScans,
  type OfflineSyncResult,
} from "./offlineValidationStore";

type Batch = {
  snapshotId: string;
  deviceId: string;
  scans: { clientScanId: string; validationHash: string; scannedAt: string }[];
};
const running = new Map<string, Promise<OfflineSyncResult[]>>();

// Persist each successful batch before sending the next. A failed request can
// safely be retried using the same clientScanIds (server-side idempotency).
export function syncPendingScans(userId: string, eventId: string, send: (batch: Batch) => Promise<{ results: OfflineSyncResult[] }>) {
  const key = `${userId}:${eventId}`;
  const current = running.get(key);
  if (current) return current;
  const task = (async () => {
    const pending = await getPendingOfflineScans(userId, eventId);
    const groups = new Map<string, typeof pending>();
    for (const scan of pending) {
      const key = `${scan.snapshotId}:${scan.deviceId}`;
      const group = groups.get(key) ?? [];
      group.push(scan);
      groups.set(key, group);
    }
    const results: OfflineSyncResult[] = [];
    for (const group of groups.values()) {
      for (let offset = 0; offset < group.length; offset += 200) {
        const chunk = group.slice(offset, offset + 200);
        const response = await send({
          snapshotId: chunk[0].snapshotId, deviceId: chunk[0].deviceId,
          scans: chunk.map(({ clientScanId, validationHash, scannedAt }) => ({ clientScanId, validationHash, scannedAt })),
        });
        const ids = new Set(response.results.map((result) => result.clientScanId));
        if (chunk.some((scan) => !ids.has(scan.clientScanId))) throw new Error("INCOMPLETE_OFFLINE_SYNC");
        await applyOfflineSyncResults(userId, eventId, response.results);
        results.push(...response.results);
      }
    }
    return results;
  })().finally(() => running.delete(key));
  running.set(key, task);
  return task;
}
