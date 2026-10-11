import type { ReadableSchema } from '@packages/api-client/src/Client';
import type { SocialFeedItem } from '../../../pulse-app/src/components/social/feedTypes';
export { groupFeedItems } from '../../../pulse-app/src/components/social/groupFeedItems';
export type { FeedGroup } from '../../../pulse-app/src/components/social/feedTypes';
export type Friend = Pick<ReadableSchema<'PublicProfileResponse'>, 'id' | 'username' | 'avatarUrl' | 'bio'>;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function rows(value: unknown): unknown[] { if (value == null) return []; if (!Array.isArray(value)) throw new Error('Invalid social response'); return value; }
export function parseFriends(value: unknown): Friend[] {
  const unique = new Map<string, Friend>();
  for (const row of rows(value)) if (record(row) && text(row.id) && text(row.username)) unique.set(row.id, {
    id: row.id, username: row.username, avatarUrl: text(row.avatarUrl) ? row.avatarUrl : undefined, bio: text(row.bio) ? row.bio : undefined,
  });
  return [...unique.values()];
}
export function parseFeed(value: unknown): SocialFeedItem[] {
  return rows(value).flatMap(row => {
    if (!record(row) || !['friend_ticket','friend_going','organizer_event','organizer_update'].includes(String(row.activityType)) ||
      !text(row.actorId) || !text(row.actorUsername) || !text(row.eventId) || !text(row.eventTitle) ||
      !text(row.occurredAt) || !Number.isFinite(Date.parse(row.occurredAt)) ||
      !text(row.eventStartTime) || !Number.isFinite(Date.parse(row.eventStartTime)) ||
      (row.activityType === 'organizer_update' && !text(row.organizerUpdateId))) return [];
    const optional = (key: string) => text(row[key]) ? row[key] : undefined;
    return [{ activityType: row.activityType as SocialFeedItem['activityType'], actorId: row.actorId, actorUsername: row.actorUsername,
      eventId: row.eventId, eventTitle: row.eventTitle, occurredAt: row.occurredAt, eventStartTime: row.eventStartTime,
      actorAvatarUrl: optional('actorAvatarUrl'), eventBannerUrl: optional('eventBannerUrl'), organizerName: optional('organizerName'),
      organizerUpdateId: optional('organizerUpdateId'), organizerUpdateImageUrl: optional('organizerUpdateImageUrl'), organizerUpdateCaption: optional('organizerUpdateCaption') }];
  });
}
