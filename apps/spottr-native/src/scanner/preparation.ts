import { ApiError } from '../data/http';
import type { Snapshot, SyncResult, ValidationEvent } from './data';
import type { OfflineState } from './offline';

export type PreparationStep = 'camera' | 'access' | 'sync' | 'package';
export type PreparationProgress = { step: PreparationStep; status: 'checking' | 'done' };
export class PreparationError extends Error {
  constructor(readonly code: 'camera' | 'offline' | 'access' | 'ended' | 'storage' | 'cancelled' | 'busy') { super(code); }
}
export type PrepareScanner = (camera: () => Promise<boolean>, progress: (value: PreparationProgress) => void) => Promise<{ tickets: number; conflicts: number }>;

/** A successful check includes a fresh server authorization and a durable read-back. */
export async function prepareScanner(options: {
  eventId: string; isCurrent(): boolean; now?: () => number;
  camera(): Promise<boolean>; online(): Promise<boolean>; events(): Promise<ValidationEvent[]>;
  sync(): Promise<SyncResult[]>; snapshot(): Promise<Snapshot>;
  save(snapshot: Snapshot, event: ValidationEvent): Promise<void>; read(): Promise<OfflineState>;
  revoke(): Promise<void>; progress(value: PreparationProgress): void;
}) {
  const current = () => { if (!options.isCurrent()) throw new PreparationError('cancelled'); };
  const progress = (step: PreparationStep, status: PreparationProgress['status']) => { current(); options.progress({ step, status }); };
  const now = options.now ?? Date.now;
  progress('camera', 'checking');
  if (!await options.camera()) throw new PreparationError('camera');
  progress('camera', 'done');
  progress('access', 'checking');
  if (!await options.online()) throw new PreparationError('offline');
  current();
  try {
    const event = (await options.events()).find(event => event.id === options.eventId);
    current();
    if (!event) { await options.revoke(); throw new PreparationError('access'); }
    if (Date.parse(event.endTime) <= now()) throw new PreparationError('ended');
    progress('access', 'done');
    progress('sync', 'checking');
    const results = await options.sync();
    progress('sync', 'done');
    progress('package', 'checking');
    const snapshot = await options.snapshot();
    current();
    await options.save(snapshot, event);
    current();
    const stored = await options.read();
    current();
    if (stored.revoked || stored.snapshot?.snapshotId !== snapshot.snapshotId || stored.snapshot.ticketCount !== snapshot.ticketCount || Date.parse(snapshot.expiresAt) <= now() || Date.parse(snapshot.generatedAt) > now()) throw new PreparationError('storage');
    progress('package', 'done');
    return { tickets: snapshot.ticketCount, conflicts: results.filter(result => result.status !== 'accepted').length };
  } catch (error) {
    if (options.isCurrent() && error instanceof ApiError && (error.status === 401 || error.status === 403)) await options.revoke();
    throw error;
  }
}

export function offlinePackageStatus(state: OfflineState | undefined, now: number) {
  const snapshot = state?.snapshot;
  if (state?.revoked) return 'revoked';
  if (!snapshot) return 'missing';
  if (!Number.isFinite(Date.parse(snapshot.expiresAt)) || Date.parse(snapshot.expiresAt) <= now) return 'expired';
  if (!Number.isFinite(Date.parse(snapshot.generatedAt)) || Date.parse(snapshot.generatedAt) > now) return 'clock';
  return 'ready';
}

export function packageAge(generatedAt: string, now: number, ro: boolean) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(generatedAt)) / 60000));
  if (!Number.isFinite(minutes)) return ro ? 'Dată necunoscută' : 'Unknown date';
  if (minutes === 0) return ro ? 'Actualizat acum' : 'Updated just now';
  if (minutes < 60) return ro ? `Actualizat acum ${minutes} min` : `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return ro ? `Actualizat acum ${hours} h` : `Updated ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return ro ? `Actualizat acum ${days} zile` : `Updated ${days} days ago`;
}
