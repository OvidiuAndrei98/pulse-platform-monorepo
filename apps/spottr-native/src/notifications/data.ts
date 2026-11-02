import type { components } from '@packages/api-client/schema';
export type Notification = components['schemas']['NotificationResponse'];
export type NotificationList = components['schemas']['NotificationListResponse'];
export type NotificationPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'earlier';

/** Only the newest notice for a currently pending request is actionable. */
export function pendingRequestNotifications(items: readonly Notification[], requesterIds: readonly string[]) {
  const pending = new Set(requesterIds), latest = new Map<string, Notification>();
  for (const item of items) {
    if (item.type !== 'friend_request' || !item.actorId || !pending.has(item.actorId)) continue;
    const previous = latest.get(item.actorId);
    if (!previous || Date.parse(item.createdAt) > Date.parse(previous.createdAt)) latest.set(item.actorId, item);
  }
  return new Set([...latest.values()].map(item => item.id));
}

export function groupNotifications(items: readonly Notification[], now = Date.now()) {
  const date = new Date(now);
  const boundary = (days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - days).getTime();
  const periods = [
    ['today', boundary(0)], ['yesterday', boundary(1)], ['week', boundary(6)], ['month', boundary(29)], ['earlier', -Infinity],
  ] as const;
  const rows = new Map<NotificationPeriod, Notification[]>(periods.map(([key]) => [key, []]));
  for (const item of [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    const timestamp = Date.parse(item.createdAt);
    if (!Number.isFinite(timestamp)) continue;
    const period = periods.find(([, start]) => timestamp >= start)![0];
    rows.get(period)!.push(item);
  }
  return periods.flatMap(([key]) => rows.get(key)!.length ? [{ key, data: rows.get(key)! }] : []);
}

export function parseNotifications(value: unknown): NotificationList {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid notifications');
  const row = value as Record<string, unknown>;
  if (row.items != null && !Array.isArray(row.items)) throw new Error('Invalid notifications');
  const unique = new Map<string, Notification>();
  for (const item of (row.items ?? []) as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Notification;
    if (typeof entry.id !== 'string' || !entry.id || typeof entry.type !== 'string' || typeof entry.title !== 'string' || typeof entry.body !== 'string' || typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt)) || typeof entry.isRead !== 'boolean') continue;
    const text = (value: unknown) => typeof value === 'string' && value ? value : undefined;
    unique.set(entry.id, { id: entry.id, type: entry.type, title: entry.title, body: entry.body, createdAt: entry.createdAt, isRead: entry.isRead,
      actorId: text(entry.actorId), actorUsername: text(entry.actorUsername), actorAvatarUrl: text(entry.actorAvatarUrl), eventId: text(entry.eventId) });
  }
  const items = [...unique.values()];
  const visibleUnread = items.filter(item => !item.isRead).length;
  return { items, unreadCount: typeof row.unreadCount === 'number' && Number.isSafeInteger(row.unreadCount) ? Math.max(visibleUnread, row.unreadCount) : visibleUnread };
}

export function markNotificationRead(current: NotificationList | undefined, id: string): NotificationList | undefined {
  if (!current || !current.items.some(item => item.id === id && !item.isRead)) return current;
  return { items: current.items.map(item => item.id === id ? { ...item, isRead: true } : item), unreadCount: Math.max(0, current.unreadCount - 1) };
}

export function removeNotifications(current: NotificationList | undefined, ids: readonly string[]): NotificationList | undefined {
  if (!current || !ids.length) return current;
  const removed = new Set(ids), items = current.items.filter(item => !removed.has(item.id));
  const unreadRemoved = current.items.filter(item => removed.has(item.id) && !item.isRead).length;
  return items.length === current.items.length ? current : { items, unreadCount: Math.max(0, current.unreadCount - unreadRemoved) };
}

export function notificationDestination(item: Notification) {
  if (item.eventId) return { kind: item.type === 'safety_group_invite' || item.type === 'safety_help' || item.type === 'safety_help_resolved' ? 'safety' as const : 'event' as const, id: item.eventId };
  return item.actorId ? { kind: 'profile' as const, id: item.actorId } : null;
}
