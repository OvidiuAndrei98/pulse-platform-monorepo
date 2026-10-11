import type { createHttp } from '../data/http';
import { ApiError } from '../data/http';

export type ValidationEvent = { id: string; title: string; startTime: string; endTime: string; status: string; locationName: string; canManage: boolean };
export type ValidationResult = { status: 'valid' | 'already_validated' | 'revoked'; ticketId: string; ticketType: string; eventTitle: string; validatedAt: string; invitationLabel?: string };
export type Snapshot = { snapshotId: string; eventId: string; eventTitle: string; generatedAt: string; expiresAt: string; ticketCount: number; tickets: { ticketId: string; validationHash: string; ticketType: string }[] };
export type SyncResult = { clientScanId: string; status: 'accepted' | 'already_validated' | 'invalid' | 'wrong_event' };
export type SyncBatch = { snapshotId: string; deviceId: string; scans: { clientScanId: string; validationHash: string; scannedAt: string }[] };
export type Staff = { id: string; username: string; email: string };
export type ScannerAccess = { id: string; label: string; startsAt: string; endsAt: string; revokedAt?: string };
export type QuickSession = { sessionToken: string; label: string; eventTitle: string; locationName: string; expiresAt: string };
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SCANNER_RESPONSE'); return value as Record<string, unknown>; }
function id(value: unknown): string { if (typeof value !== 'string' || !uuid.test(value)) throw new Error('INVALID_SCANNER_ID'); return value.toLowerCase(); }
function string(value: unknown): string { if (typeof value !== 'string') throw new Error('INVALID_SCANNER_RESPONSE'); return value; }
function date(value: unknown): string { const result = string(value); if (!Number.isFinite(Date.parse(result))) throw new Error('INVALID_SCANNER_DATE'); return result; }
export function ticketCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value.trim())) throw new Error('INVALID_TICKET_CODE');
  return value.trim().toLowerCase();
}
export function parseEvent(value: unknown): ValidationEvent {
  const row = record(value); return { id: id(row.id), title: string(row.title), startTime: date(row.startTime), endTime: date(row.endTime), status: string(row.status), locationName: string(row.locationName), canManage: row.canManage === true };
}
/** The server's live-event list excludes ended events, including unsynced ones.
 * Local entries are already filtered by the durable store: an expired package
 * is returned only while it still has pending admissions. Absence from a live
 * list is not evidence of revoked scanner permission.
 */
export function mergeValidationEvents(remote: readonly ValidationEvent[], prepared: readonly ValidationEvent[]): ValidationEvent[] {
  const events = new Map(prepared.map(event => [event.id, event]));
  for (const event of remote) events.set(event.id, event);
  return [...events.values()].sort((a, b) => b.startTime.localeCompare(a.startTime));
}
export function parseSnapshot(value: unknown, eventId: string): Snapshot {
  const row = record(value); if (id(row.eventId) !== id(eventId) || !Array.isArray(row.tickets) || row.ticketCount !== row.tickets.length) throw new Error('INVALID_OFFLINE_PACKAGE');
  const tickets = row.tickets.map(value => { const ticket = record(value); return { ticketId: id(ticket.ticketId), validationHash: ticketCode(ticket.validationHash), ticketType: string(ticket.ticketType) }; });
  if (new Set(tickets.map(ticket => ticket.validationHash)).size !== tickets.length) throw new Error('INVALID_OFFLINE_PACKAGE');
  const generatedAt = date(row.generatedAt), expiresAt = date(row.expiresAt);
  if (Date.parse(generatedAt) >= Date.parse(expiresAt)) throw new Error('INVALID_OFFLINE_PACKAGE');
  return { snapshotId: id(row.snapshotId), eventId: id(row.eventId), eventTitle: string(row.eventTitle), generatedAt, expiresAt, ticketCount: tickets.length, tickets };
}
export function parseValidation(value: unknown): ValidationResult {
  const row = record(value); if (row.status !== 'valid' && row.status !== 'already_validated' && row.status !== 'revoked') throw new Error('INVALID_SCANNER_RESPONSE');
  // Invitations have a distinct existing backend response without eventTitle.
  const invitation = typeof row.invitationLabel === 'string' && typeof row.eventId === 'string' && uuid.test(row.eventId);
  return { status: row.status, ticketId: id(row.ticketId), ticketType: string(row.ticketType), eventTitle: invitation && row.eventTitle === undefined ? '' : string(row.eventTitle), validatedAt: date(row.validatedAt), invitationLabel: invitation ? row.invitationLabel as string : undefined };
}
export function parseQuickSession(value: unknown): QuickSession {
  const row = record(value), sessionToken = string(row.sessionToken); if (sessionToken.length < 20) throw new Error('INVALID_SCANNER_RESPONSE');
  return { sessionToken, label: string(row.label), eventTitle: string(row.eventTitle), locationName: string(row.locationName), expiresAt: date(row.expiresAt) };
}
export function isConnectivityError(error: unknown) { return error instanceof TypeError || error instanceof ApiError && error.status === 0 && error.code !== 'INVALID_RESPONSE'; }
export function createScannerApi(request: ReturnType<typeof createHttp>) {
  const path = (eventId: string) => '/dashboard/ticket-validation/events/' + id(eventId);
  return {
    events: async (token: string, signal?: AbortSignal) => { const rows = await request<unknown>('/dashboard/ticket-validation/events', { token, signal }); if (rows === null) return []; if (!Array.isArray(rows)) throw new Error('INVALID_SCANNER_RESPONSE'); return rows.map(parseEvent); },
    validate: async (eventId: string, hash: string, token: string) => parseValidation(await request(path(eventId) + '/tickets/validate', { method: 'POST', body: { validationHash: ticketCode(hash) }, token })),
    snapshot: async (eventId: string, token: string) => parseSnapshot(await request(path(eventId) + '/offline-snapshot', { method: 'POST', token }), eventId),
    sync: (eventId: string, body: SyncBatch, token: string) => request<{ results: SyncResult[] }>(path(eventId) + '/offline-sync', { method: 'POST', token, body }),
    history: async (eventId: string, token: string) => {
      const row = record(await request(path(eventId) + '/my-scans', { token }));
      if (!Number.isInteger(row.totalScans) || (row.totalScans as number) < 0 || !Array.isArray(row.scans)) throw new Error('INVALID_SCANNER_RESPONSE');
      return { totalScans: row.totalScans as number, scans: row.scans.map(value => { const row = record(value); return { ticketId: id(row.ticketId), ticketType: string(row.ticketType), validatedAt: date(row.validatedAt) }; }) };
    },
    staff: async (eventId: string, token: string) => { const rows = await request<unknown>(path(eventId) + '/staff', { token }); if (rows === null) return []; if (!Array.isArray(rows)) throw new Error('INVALID_SCANNER_RESPONSE'); return rows.map(value => { const row = record(value); return { id: id(row.id), username: string(row.username), email: string(row.email) }; }); },
    addStaff: (eventId: string, email: string, token: string) => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) throw new Error('INVALID_EMAIL'); return request(path(eventId) + '/staff', { method: 'POST', body: { email: email.trim() }, token }); },
    removeStaff: (eventId: string, userId: string, token: string) => request(path(eventId) + '/staff/' + id(userId), { method: 'DELETE', token }),
    accesses: async (eventId: string, token: string): Promise<ScannerAccess[]> => { const rows = await request<unknown>(path(eventId) + '/quick-access', { token }); if (rows === null) return []; if (!Array.isArray(rows)) throw new Error('INVALID_SCANNER_RESPONSE'); return rows.map(value => { const row = record(value); return { id: id(row.id), label: string(row.label), startsAt: date(row.startsAt), endsAt: date(row.endsAt), revokedAt: row.revokedAt ? date(row.revokedAt) : undefined }; }); },
    createAccess: async (event: ValidationEvent, label: string, startsAt: string, endsAt: string, token: string) => {
      const start = Date.parse(startsAt), end = Date.parse(endsAt);
      if (!label.trim() || label.trim().length > 100 || !Number.isFinite(start) || !Number.isFinite(end) || start >= end || start < Date.parse(event.startTime) || end > Date.parse(event.endTime)) throw new Error('INVALID_SCANNER_INTERVAL');
      const row = record(await request(path(event.id) + '/quick-access', { method: 'POST', token, body: { label: label.trim(), startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() } }));
      return { url: string(row.url) };
    },
    revokeAccess: (eventId: string, accessId: string, token: string) => request(path(eventId) + '/quick-access/' + id(accessId), { method: 'DELETE', token }),
    quickSession: async (value: string) => { if (!/^[a-zA-Z0-9_-]{64}$/.test(value)) throw new Error('INVALID_SCANNER_LINK'); return parseQuickSession(await request('/ticket-validation/quick-access/session', { method: 'POST', body: { token: value }, token: null, expireSession: false })); },
    quickValidate: async (session: QuickSession, value: string, now = Date.now()) => { if (Date.parse(session.expiresAt) <= now) throw new ApiError(401, 'SCANNER_EXPIRED'); return parseValidation(await request('/ticket-validation/quick-access/validate', { method: 'POST', body: { validationHash: ticketCode(value) }, token: session.sessionToken, expireSession: false })); },
  };
}
