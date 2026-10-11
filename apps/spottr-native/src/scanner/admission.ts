import { ApiError } from '../data/http';
import { ticketCode, type ValidationResult } from './data';
import type { createOfflineScanner, OfflineResult } from './offline';

export type Admission = ValidationResult | OfflineResult;
/** One physical scan stays latched until the operator explicitly scans next. */
export class AdmissionGate {
  private busy = false;
  private latched = false;
  reset() { if (!this.busy) this.latched = false; }
  async run(work: () => Promise<Admission>): Promise<Admission | undefined> {
    if (this.busy || this.latched) return undefined;
    this.busy = true; this.latched = true;
    try { return await work(); } finally { this.busy = false; }
  }
}
export async function admitTicket({ userId, eventId, hash, offline, store, validate, sync }: {
  userId: string; eventId: string; hash: string; offline: boolean;
  store: ReturnType<typeof createOfflineScanner>;
  validate: (hash: string) => Promise<ValidationResult>;
  sync: () => Promise<unknown>;
}): Promise<Admission> {
  const normalized = ticketCode(hash);
  if (offline) return store.scan(userId, eventId, normalized);
  await sync(); // Persist queued admissions before revalidating an offline ticket online.
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
