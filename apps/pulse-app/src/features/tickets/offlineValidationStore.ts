import { DBSchema, openDB } from "idb";

export type OfflineTicketSnapshot = {
  ticketId: string;
  validationHash: string;
  ticketType: string;
};

export type OfflineValidationSnapshot = {
  snapshotId: string;
  eventId: string;
  eventTitle: string;
  generatedAt: string;
  expiresAt: string;
  ticketCount: number;
  tickets: OfflineTicketSnapshot[];
};

export type OfflineScanStatus =
  | "pending"
  | "synced"
  | "conflict";

export type OfflineTicketScan = {
  clientScanId: string;
  cacheKey: string;
  eventId: string;
  snapshotId: string;
  deviceId: string;
  validationHash: string;
  ticketId: string;
  ticketType: string;
  scannedAt: string;
  syncStatus: OfflineScanStatus;
  serverStatus?: "accepted" | "already_validated" | "invalid" | "wrong_event";
};

type StoredSnapshot = OfflineValidationSnapshot & {
  cacheKey: string;
  userId: string;
};

type OfflineValidationDb = DBSchema & {
  snapshots: {
    key: string;
    value: StoredSnapshot;
  };
  scans: {
    key: string;
    value: OfflineTicketScan;
    indexes: {
      "by-cache-key": string;
      "by-cache-hash": [string, string];
      "by-cache-status": [string, OfflineScanStatus];
    };
  };
  meta: {
    key: string;
    value: string;
  };
};

const DB_NAME = "glow-offline-ticket-validation";
const DB_VERSION = 1;

function cacheKey(userId: string, eventId: string) {
  return `${userId}:${eventId}`;
}

async function getDb() {
  return openDB<OfflineValidationDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("snapshots", { keyPath: "cacheKey" });
      const scans = db.createObjectStore("scans", { keyPath: "clientScanId" });
      scans.createIndex("by-cache-key", "cacheKey");
      scans.createIndex("by-cache-hash", ["cacheKey", "validationHash"]);
      scans.createIndex("by-cache-status", ["cacheKey", "syncStatus"]);
      db.createObjectStore("meta");
    },
  });
}

function hasExpired(snapshot: OfflineValidationSnapshot) {
  return Date.now() >= new Date(snapshot.expiresAt).getTime();
}

export async function getOfflineDeviceId() {
  const db = await getDb();
  const current = await db.get("meta", "device-id");
  if (current) return current;
  const deviceId = crypto.randomUUID();
  await db.put("meta", deviceId, "device-id");
  return deviceId;
}

export async function saveOfflineSnapshot(
  userId: string,
  snapshot: OfflineValidationSnapshot,
) {
  const db = await getDb();
  await db.put("snapshots", {
    ...snapshot,
    cacheKey: cacheKey(userId, snapshot.eventId),
    userId,
  });
}

export async function getOfflineSnapshot(userId: string, eventId: string) {
  const db = await getDb();
  const key = cacheKey(userId, eventId);
  const snapshot = await db.get("snapshots", key);
  if (!snapshot) return undefined;
  if (hasExpired(snapshot)) {
    await clearOfflineEventData(userId, eventId);
    return undefined;
  }
  return snapshot;
}

export async function getOfflineValidationState(userId: string, eventId: string) {
  const snapshot = await getOfflineSnapshot(userId, eventId);
  if (!snapshot) return { snapshot: undefined, pendingCount: 0 };
  const db = await getDb();
  const pending = await db.getAllFromIndex(
    "scans",
    "by-cache-status",
    IDBKeyRange.only([snapshot.cacheKey, "pending"]),
  );
  return { snapshot, pendingCount: pending.length };
}

export async function clearOfflineEventData(userId: string, eventId: string) {
  const db = await getDb();
  const key = cacheKey(userId, eventId);
  const tx = db.transaction(["snapshots", "scans"], "readwrite");
  const scansStore = tx.objectStore("scans");
  const scanKeys = await scansStore.index("by-cache-key").getAllKeys(key);
  for (const scanKey of scanKeys) await scansStore.delete(scanKey);
  await tx.objectStore("snapshots").delete(key);
  await tx.done;
}

export async function clearExpiredOfflineData() {
  const db = await getDb();
  const snapshots = await db.getAll("snapshots");
  await Promise.all(
    snapshots
      .filter(hasExpired)
      .map((snapshot) => clearOfflineEventData(snapshot.userId, snapshot.eventId)),
  );
}

export async function clearAllOfflineValidationData() {
  const db = await getDb();
  const tx = db.transaction(["snapshots", "scans"], "readwrite");
  await tx.objectStore("snapshots").clear();
  await tx.objectStore("scans").clear();
  await tx.done;
}

export type LocalScanResult =
  | { status: "accepted"; scan: OfflineTicketScan }
  | { status: "duplicate"; scan: OfflineTicketScan }
  | { status: "unknown" | "expired" | "unprepared" };

export async function recordOfflineTicketScan(
  userId: string,
  eventId: string,
  validationHash: string,
): Promise<LocalScanResult> {
  const snapshot = await getOfflineSnapshot(userId, eventId);
  if (!snapshot) return { status: "unprepared" };
  if (hasExpired(snapshot)) return { status: "expired" };

  const normalizedHash = validationHash.trim();
  const ticket = snapshot.tickets.find(
    (item) => item.validationHash === normalizedHash,
  );
  if (!ticket) return { status: "unknown" };

  const db = await getDb();
  const existing = await db.getFromIndex(
    "scans",
    "by-cache-hash",
    [snapshot.cacheKey, normalizedHash],
  );
  if (existing) return { status: "duplicate", scan: existing };

  const scan: OfflineTicketScan = {
    clientScanId: crypto.randomUUID(),
    cacheKey: snapshot.cacheKey,
    eventId,
    snapshotId: snapshot.snapshotId,
    deviceId: await getOfflineDeviceId(),
    validationHash: normalizedHash,
    ticketId: ticket.ticketId,
    ticketType: ticket.ticketType,
    scannedAt: new Date().toISOString(),
    syncStatus: "pending",
  };
  await db.add("scans", scan);
  return { status: "accepted", scan };
}

export async function getPendingOfflineScans(userId: string, eventId: string) {
  const snapshot = await getOfflineSnapshot(userId, eventId);
  if (!snapshot) return [];
  const db = await getDb();
  return db.getAllFromIndex(
    "scans",
    "by-cache-status",
    IDBKeyRange.only([snapshot.cacheKey, "pending"]),
  );
}

export type OfflineSyncResult = {
  clientScanId: string;
  status: "accepted" | "already_validated" | "invalid" | "wrong_event";
  ticketId?: string;
  ticketType?: string;
  eventTitle?: string;
  validatedAt?: string;
};

export async function applyOfflineSyncResults(
  userId: string,
  eventId: string,
  results: OfflineSyncResult[],
) {
  const snapshot = await getOfflineSnapshot(userId, eventId);
  if (!snapshot) return;
  const db = await getDb();
  const tx = db.transaction("scans", "readwrite");
  for (const result of results) {
    const scan = await tx.store.get(result.clientScanId);
    if (!scan || scan.cacheKey !== snapshot.cacheKey) continue;
    scan.syncStatus = result.status === "accepted" ? "synced" : "conflict";
    scan.serverStatus = result.status;
    await tx.store.put(scan);
  }
  await tx.done;
}
