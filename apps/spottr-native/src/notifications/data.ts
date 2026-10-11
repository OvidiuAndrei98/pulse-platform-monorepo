import type { components } from '@packages/api-client/src/schema';
export type Notification = components['schemas']['NotificationResponse'];
export type NotificationList = components['schemas']['NotificationListResponse'];

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

export function notificationDestination(item: Notification) {
  if (item.eventId) return { kind: item.type === 'safety_group_invite' || item.type === 'safety_help' || item.type === 'safety_help_resolved' ? 'safety' as const : 'event' as const, id: item.eventId };
  return item.actorId ? { kind: 'profile' as const, id: item.actorId } : null;
}
