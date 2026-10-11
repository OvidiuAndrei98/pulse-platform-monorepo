import type { components } from '@packages/api-client/src/schema';
import { ApiError, type createHttp } from '../data/http';
import { httpUrl, isEventId } from '../data/events';

export type SafetyEnvelope = components['schemas']['EventSafetyGroupEnvelopeResponse'];
export type SafetyGroup = NonNullable<SafetyEnvelope['group']>;
export type SafetyFriend = components['schemas']['EligibleSafetyFriendResponse'];
export type SafetyAction =
  | { kind: 'create'; friendIds: string[] }
  | { kind: 'invite'; friendIds: string[] }
  | { kind: 'respond'; status: 'accepted' | 'declined' }
  | { kind: 'messages' | 'help' | 'help-resolved'; content: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const invalid = (): never => { throw new ApiError(0, 'INVALID_RESPONSE'); };
const rows = (v: unknown): unknown[] => v == null ? [] : Array.isArray(v) ? v : invalid();
const id = (v: unknown): string => isEventId(v) ? v.toLowerCase() : invalid();
const text = (v: unknown): string => typeof v === 'string' ? v : invalid();
const bool = (v: unknown): boolean => typeof v === 'boolean' ? v : invalid();
const stamp = (v: unknown): string => date(v) ? v : invalid();
function friend(v: unknown): SafetyFriend {
  if (!object(v)) return invalid();
  return { userId: id(v.userId), username: text(v.username), avatarUrl: httpUrl(v.avatarUrl) };
}
function unique<T>(values: T[], key: (v: T) => string): T[] { return [...new Map(values.map(v => [key(v), v])).values()]; }

/** Reject an invalid security envelope instead of guessing permission flags. */
export function parseSafetyEnvelope(value: unknown, eventId: string): SafetyEnvelope {
  if (!object(value) || !isEventId(eventId)) return invalid();
  const result: SafetyEnvelope = {
    canCreate: bool(value.canCreate), ticketValidated: bool(value.ticketValidated),
    eligibleFriends: unique(rows(value.eligibleFriends).map(friend), v => v.userId),
  };
  if (value.group == null) return result;
  const group = value.group;
  if (!object(group) || id(group.eventId) !== eventId.toLowerCase() || !['pending', 'accepted'].includes(String(group.currentMemberStatus))) return invalid();
  result.group = {
    id: id(group.id), eventId: id(group.eventId), ownerId: id(group.ownerId), eventTitle: text(group.eventTitle), eventLocation: text(group.eventLocation),
    startTime: stamp(group.startTime), endTime: stamp(group.endTime), expiresAt: stamp(group.expiresAt),
    currentMemberStatus: group.currentMemberStatus as SafetyGroup['currentMemberStatus'],
    canSendHelp: bool(group.canSendHelp), currentUserNeedsHelp: bool(group.currentUserNeedsHelp),
    members: unique(rows(group.members).map(value => {
      if (!object(value) || !['pending', 'accepted'].includes(String(value.status))) return invalid();
      return { ...friend(value), status: value.status as 'pending' | 'accepted' };
    }), v => v.userId),
    messages: unique(rows(group.messages).map(value => {
      if (!object(value) || !['message', 'help', 'help_resolved', 'system'].includes(String(value.kind))) return invalid();
      return { id: id(value.id), senderId: id(value.senderId), senderUsername: text(value.senderUsername), senderAvatarUrl: httpUrl(value.senderAvatarUrl),
        kind: value.kind as SafetyGroup['messages'][number]['kind'], content: text(value.content), createdAt: stamp(value.createdAt) };
    }), v => v.id),
  };
  return result;
}
export function selectedSafetyFriends(data: SafetyEnvelope, selected: readonly string[]): string[] {
  const eligible = new Set(data.eligibleFriends.map(v => v.userId));
  return [...new Set(selected)].filter(v => eligible.has(v)).slice(0, data.group ? Math.max(0, 8 - data.group.members.length) : 7);
}
export function canSafetyAction(data: SafetyEnvelope | null, action: SafetyAction, viewer: string): boolean {
  if (!data) return false;
  const group = data.group;
  if (action.kind === 'create' || action.kind === 'invite') {
    const friends = selectedSafetyFriends(data, action.friendIds);
    if (!friends.length || friends.length !== action.friendIds.length) return false;
    return action.kind === 'create' ? !group && data.canCreate : !!group && group.currentMemberStatus === 'accepted' && group.ownerId === viewer;
  }
  if (action.kind === 'respond') return !!group && group.currentMemberStatus === 'pending';
  if (!group || group.currentMemberStatus !== 'accepted' || !action.content.trim() || Array.from(action.content.trim()).length > 500) return false;
  return action.kind === 'help' ? group.canSendHelp && !group.currentUserNeedsHelp : action.kind === 'help-resolved' ? group.currentUserNeedsHelp : true;
}
export function createSafetyApi(request: ReturnType<typeof createHttp>) {
  const path = (eventId: string) => { if (!isEventId(eventId)) throw new ApiError(404, 'NOT_FOUND'); return '/events/' + eventId.toLowerCase() + '/safety-group'; };
  return {
    async load(eventId: string, token: string, signal: AbortSignal) { return parseSafetyEnvelope(await request(path(eventId), { token, signal }), eventId); },
    async change(eventId: string, action: SafetyAction, token: string, signal: AbortSignal) {
      const body = action.kind === 'create' || action.kind === 'invite' ? { friendIds: action.friendIds }
        : action.kind === 'respond' ? { status: action.status } : { content: action.content.trim() };
      await request(path(eventId) + (action.kind === 'create' ? '' : '/' + action.kind), { token, signal, method: 'POST', body });
    },
  };
}
