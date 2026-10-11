import type { components } from '@packages/api-client/src/schema';
import { ApiError } from '../data/http';
import { parseProfile } from '../profiles/data';

export type EventAttendee = components['schemas']['EventAttendeeResponse'];
export function parseEventFriends(value: unknown): EventAttendee[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ApiError(0, 'INVALID_RESPONSE');
  const friends = new Map<string, EventAttendee>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || !['going', 'has_ticket'].includes(item.attendanceStatus)) continue;
    try {
      const profile = parseProfile(item);
      if (profile.relationship === 'friends') friends.set(profile.id, { ...profile, attendanceStatus: item.attendanceStatus });
    } catch { /* Do not render broken profiles or guess a friendship. */ }
  }
  return [...friends.values()];
}
