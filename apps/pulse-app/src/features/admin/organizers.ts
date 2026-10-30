import type { components } from '@packages/api-client/src/schema';
import { parseCommissionSettings } from './commissions';
export type DirectoryItem = components['schemas']['OrganizerDirectoryItem'];
export type DirectoryPage = components['schemas']['OrganizerDirectoryPage'];
export type DirectoryDetail = components['schemas']['OrganizerDirectoryDetail'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const isOrganizerId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_DIRECTORY'); return value as Record<string, unknown>; }
function text(row: Record<string, unknown>, key: string): string { if (typeof row[key] !== 'string' || row[key].length > 4000) throw Error('INVALID_DIRECTORY'); return row[key]; }
function count(row: Record<string, unknown>, key: string): number { const value = row[key]; if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw Error('INVALID_DIRECTORY'); return value; }
function date(value: string, optional = false) { if ((!optional || value !== '') && !Number.isFinite(Date.parse(value))) throw Error('INVALID_DIRECTORY'); return value; }
function boolean(row: Record<string, unknown>, key: string): boolean { if (typeof row[key] !== 'boolean') throw Error('INVALID_DIRECTORY'); return row[key]; }
function item(value: unknown): DirectoryItem {
  const row = record(value);
  if (!isOrganizerId(row.userId) || !['pending','approved','rejected'].includes(String(row.verificationStatus)) || !['active','attention','onboarding','notConnected'].includes(String(row.stripeStatus))) throw Error('INVALID_DIRECTORY');
  return { userId: row.userId, companyName: text(row,'companyName'), cui: text(row,'cui'), username: text(row,'username'), email: text(row,'email'),
    verificationStatus: String(row.verificationStatus), accountActive: boolean(row,'accountActive'), stripeStatus: String(row.stripeStatus), createdAt: date(text(row,'createdAt')), updatedAt: date(text(row,'updatedAt')) };
}
export function parseDirectoryPage(value: unknown): DirectoryPage {
  const row = record(value);
  if (!Array.isArray(row.items) || row.items.length > 25 || row.nextCursor !== '' && !isOrganizerId(row.nextCursor)) throw Error('INVALID_DIRECTORY');
  return { items: row.items.map(item), nextCursor: row.nextCursor as string };
}
export function parseDirectoryDetail(value: unknown): DirectoryDetail {
  const row = record(value), base = item(row);
  if (!Array.isArray(row.recentEvents) || row.recentEvents.length > 20) throw Error('INVALID_DIRECTORY');
  const terms = parseCommissionSettings({ standard: row.standard, organizers: [{ organizerId: base.userId, companyName: base.companyName, email: base.email, override: row.commissionOverride, revision: row.commissionRevision }] });
  return { ...base, fiscalAddress: text(row,'fiscalAddress'), verifiedAt: date(text(row,'verifiedAt'),true), stripeAccountId: text(row,'stripeAccountId'),
    stripeChargesEnabled: boolean(row,'stripeChargesEnabled'), stripePayoutsEnabled: boolean(row,'stripePayoutsEnabled'), stripeDetailsSubmitted: boolean(row,'stripeDetailsSubmitted'),
    agreementVersion: text(row,'agreementVersion'), agreementAcceptedAt: date(text(row,'agreementAcceptedAt'),true), standard: terms.standard,
    commissionOverride: terms.organizers[0]!.override, commissionRevision: count(row,'commissionRevision'), eventCount: count(row,'eventCount'), upcomingCount: count(row,'upcomingCount'),
    liveRefundsAttention: count(row,'liveRefundsAttention'), testRefundsAttention: count(row,'testRefundsAttention'), unknownRefundsAttention: count(row,'unknownRefundsAttention'),
    recentEvents: row.recentEvents.map(value => { const event = record(value); if (!isOrganizerId(event.id)) throw Error('INVALID_DIRECTORY');
      return { id: event.id, title: text(event,'title'), status: text(event,'status'), location: text(event,'location'), startTime: date(text(event,'startTime')) }; }),
  };
}
export function organizerIssues(row: DirectoryDetail, ro: boolean): string[] {
  const issues: string[] = [];
  if (!row.accountActive) issues.push(ro ? 'Contul nu este activ.' : 'The account is inactive.');
  if (row.verificationStatus !== 'approved') issues.push(ro ? 'Firma nu are verificarea aprobată.' : 'Company verification is not approved.');
  if (row.stripeStatus !== 'active') issues.push(ro ? 'Stripe nu este pregătit pentru încasări și payout-uri.' : 'Stripe is not ready for charges and payouts.');
  if (row.liveRefundsAttention) issues.push((ro ? 'Restituiri live de verificat: ' : 'Live refunds to review: ') + row.liveRefundsAttention);
  if (row.testRefundsAttention) issues.push((ro ? 'Restituiri test de verificat: ' : 'Test refunds to review: ') + row.testRefundsAttention);
  if (row.unknownRefundsAttention) issues.push((ro ? 'Restituiri cu mediu neconfirmat: ' : 'Refunds with unverified environment: ') + row.unknownRefundsAttention);
  return issues;
}
