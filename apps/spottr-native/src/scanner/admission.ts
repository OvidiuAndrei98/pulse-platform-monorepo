import { ApiError } from '../data/http';
import { isConnectivityError, ticketCode, type ValidationResult } from './data';
import type { createOfflineScanner, OfflineResult } from './offline';

export type Admission = ValidationResult | OfflineResult;
export const SCAN_COOLDOWN_MS = 1500;
export const SAME_QR_CLEAR_MS = 1500;
export type ScanSource = 'camera' | 'manual';
/** Serialize admissions and suppress a QR that is still held in the camera. */
export class AdmissionGate {
  private busy = false;
  private blockedUntil = 0;
  private lastCode = '';
  private lastSeen = -Infinity;
  constructor(private readonly now = Date.now) {}
  async run(value: string, work: () => Promise<Admission>, source: ScanSource = 'manual'): Promise<Admission | undefined> {
    const time = this.now(), code = value.trim().toLowerCase();
    const sameVisibleCode = source === 'camera' && code === this.lastCode && time - this.lastSeen < SAME_QR_CLEAR_MS;
    if (code === this.lastCode) this.lastSeen = time;
    if (this.busy || time < this.blockedUntil || sameVisibleCode) return undefined;
    this.busy = true; this.lastCode = code; this.lastSeen = time;
    try { return await work(); }
    finally { this.busy = false; this.blockedUntil = this.now() + SCAN_COOLDOWN_MS; }
  }
}
export async function admitTicket({ userId, eventId, hash, offline, store, validate, sync, isOffline }: {
  userId: string; eventId: string; hash: string; offline: boolean;
  store: ReturnType<typeof createOfflineScanner>;
  validate: (hash: string) => Promise<ValidationResult>;
  sync: () => Promise<unknown>;
  isOffline?: () => Promise<boolean>;
}): Promise<Admission> {
  const normalized = ticketCode(hash);
  if (offline || await isOffline?.()) return store.scan(userId, eventId, normalized);
  try { await sync(); } // Persist queued admissions before revalidating an offline ticket online.
  catch (error) {
    // No validation POST has started yet. Pending scan IDs remain idempotent
    // even when their sync response was lost; a new ticket can still be local.
    if (isConnectivityError(error)) return store.scan(userId, eventId, normalized);
    throw error;
  }
  if (await isOffline?.()) return store.scan(userId, eventId, normalized);
  await store.beginOnline(userId, eventId, normalized);
  try {
    const result = await validate(normalized);
    await store.rememberOnline(userId, eventId, normalized, result);
    return result;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) await store.revoke(userId, eventId);
    // Do not fall back to offline on a POST timeout: the server may have consumed it.
    throw error;
  }
}
