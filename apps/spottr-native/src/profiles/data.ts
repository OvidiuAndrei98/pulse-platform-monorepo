import type { components } from '@packages/api-client/src/schema';
import { ApiError, type createHttp } from '../data/http';
import { httpUrl, isEventId, ensurePageProgress, mergePages, type EventPage } from '../data/events';
import type { createEventsApi } from '../data/api';

export type PublicProfile = components['schemas']['PublicProfileResponse'];
export type OrganizerUpdate = components['schemas']['OrganizerEventUpdateResponse'];
export { splitOrganizerEvents } from '../../../pulse-app/src/components/social/organizerEvents';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => typeof value === 'string' ? value : undefined;
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const relationships = ['none', 'self', 'pending_sent', 'pending_received', 'friends'];

export function parseProfile(value: unknown, expectedId?: string): PublicProfile {
  if (!record(value) || !isEventId(value.id) || !text(value.username)?.trim() ||
      !['user', 'organizer', 'admin'].includes(String(value.role)) ||
      !relationships.includes(String(value.relationship)) ||
      (expectedId && value.id.toLowerCase() !== expectedId.toLowerCase())) throw new ApiError(0, 'INVALID_RESPONSE');
  return {
    id: value.id.toLowerCase(), username: value.username as string,
    role: value.role as PublicProfile['role'], relationship: value.relationship as PublicProfile['relationship'],
    preferredLanguage: value.preferredLanguage === 'ro' ? 'ro' : 'en',
    avatarUrl: httpUrl(value.avatarUrl), bio: text(value.bio), organizerName: text(value.organizerName),
    organizerVerified: value.organizerVerified === true, followsOrganizer: value.followsOrganizer === true,
    followerCount: count(value.followerCount), eventCount: count(value.eventCount), ticketsSoldCount: count(value.ticketsSoldCount),
  };
}
export function parseProfiles(value: unknown): PublicProfile[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ApiError(0, 'INVALID_RESPONSE');
  const profiles = new Map<string, PublicProfile>();
  for (const row of value) {
    try { const profile = parseProfile(row); profiles.set(profile.id, profile); } catch { /* Skip malformed search rows. */ }
  }
  if (value.length && !profiles.size) throw new ApiError(0, 'INVALID_RESPONSE');
  return [...profiles.values()];
}
export function parseUpdates(value: unknown, now = Date.now()): OrganizerUpdate[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ApiError(0, 'INVALID_RESPONSE');
  const updates = new Map<string, OrganizerUpdate>();
  for (const row of value) {
    if (!record(row) || !isEventId(row.id) || !isEventId(row.eventId) || !isEventId(row.organizerId) || !text(row.eventTitle) || !httpUrl(row.imageUrl) ||
      !text(row.createdAt) || !Number.isFinite(Date.parse(row.createdAt as string)) || !text(row.expiresAt) || !(Date.parse(row.expiresAt as string) > now)) continue;
    updates.set(row.id, { id: row.id, eventId: row.eventId, organizerId: row.organizerId, eventTitle: row.eventTitle as string,
      imageUrl: httpUrl(row.imageUrl)!, caption: text(row.caption), createdAt: row.createdAt as string, expiresAt: row.expiresAt as string });
  }
  return [...updates.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
export type ProfileAction = 'signin' | 'follow' | 'unfollow' | 'request' | 'remove' | 'accept' | 'pending';
export function profileAction(profile: PublicProfile, viewer?: { id: string; role: string } | null): ProfileAction | null {
  if (profile.relationship === 'self' || viewer?.id === profile.id) return null;
  if (!viewer) return 'signin';
  if (profile.role === 'organizer') return profile.followsOrganizer ? 'unfollow' : 'follow';
  if (viewer.role === 'organizer') return null;
  return ({ none: 'request', friends: 'remove', pending_received: 'accept', pending_sent: 'pending', self: null } as const)[profile.relationship];
}

export function createProfilesApi(request: ReturnType<typeof createHttp>) {
  const validId = (id: string) => { if (!isEventId(id)) throw new ApiError(404, 'NOT_FOUND'); return encodeURIComponent(id); };
  return {
    async profile(id: string, signal?: AbortSignal) { return parseProfile(await request('/profiles/' + validId(id), { signal }), id); },
    async search(query: string, signal?: AbortSignal) {
      const q = query.trim();
      if (q.length < 2) return [];
      if (Array.from(q).length > 120) throw new ApiError(0, 'INVALID_QUERY');
      return parseProfiles(await request('/profiles/search?q=' + encodeURIComponent(q), { signal }));
    },
    async updates(kind: 'events' | 'organizers', id: string, signal?: AbortSignal) {
      return parseUpdates(await request('/' + kind + '/' + validId(id) + '/updates', { signal }));
    },
    async change(profile: PublicProfile, action: ProfileAction, token: string): Promise<Partial<PublicProfile>> {
      const id = validId(profile.id);
      if (action === 'signin' || action === 'pending' || profile.relationship === 'self' || !token) throw new ApiError(0, 'INVALID_ACTION');
      if (action === 'follow' || action === 'unfollow') {
        const result = await request('/organizers/' + id + '/follow', { token, method: action === 'follow' ? 'POST' : 'DELETE' });
        if (!record(result) || typeof result.followsOrganizer !== 'boolean') throw new ApiError(0, 'INVALID_RESPONSE');
        return { followsOrganizer: result.followsOrganizer, followerCount: Math.max(0, profile.followerCount + Number(result.followsOrganizer) - Number(profile.followsOrganizer)) };
      }
      const result = await request(action === 'remove' ? '/friends/' + id : '/friends/request/' + id, {
        token, method: action === 'remove' ? 'DELETE' : action === 'accept' ? 'PUT' : 'POST', ...(action === 'accept' ? { body: { status: 'accepted' } } : {}),
      });
      // The incoming request can arrive while this screen is open. The server
      // may have connected them already: preserve that authoritative response.
      const relationship = record(result) && relationships.includes(String(result.relationship)) ? result.relationship as PublicProfile['relationship']
        : action === 'remove' ? 'none' : action === 'accept' ? 'friends' : 'pending_sent';
      return { relationship };
    },
  };
}

export async function loadOrganizerEvents(api: Pick<ReturnType<typeof createEventsApi>, 'page'>, organizerId: string, signal?: AbortSignal) {
  if (!isEventId(organizerId)) throw new ApiError(404, 'NOT_FOUND');
  const pages: EventPage[] = [];
  for (let number = 1; ; number++) {
    const page = await api.page({ organizerId }, number, signal);
    ensurePageProgress(page, mergePages(pages).map(event => event.id));
    pages.push(page);
    // The API explicitly uses 100 for organizer pages, versus 20 for discovery.
    if (page.rawCount < 100) return mergePages(pages);
  }
}
