import test from 'node:test';
import assert from 'node:assert/strict';
import { groupNotifications, pendingRequestNotifications, parseNotifications, markNotificationRead, removeNotifications, notificationDestination } from '../src/notifications/data';
import { notificationText, formatNotificationTime } from '@packages/app-core/notifications/content';
import { productCopy } from '../src/copy';
import { formatDate } from '../src/data/events';

const notification = (extra: Record<string, unknown> = {}) => ({ id: 'notice-1', type: 'friend_request', title: 'New friend', body: 'Alex sent a request', createdAt: '2026-10-07T16:00:00Z', isRead: false, ...extra });

test('inbox periods use local calendar days, newest first, without changing cached notifications', () => {
  const now = new Date(2026, 10, 3, 12).getTime();
  const at = (days: number, hour = 12) => new Date(2026, 10, 3 - days, hour).toISOString();
  const items = parseNotifications({ items: [
    notification({ id: 'month', createdAt: at(29) }), notification({ id: 'yesterday', createdAt: at(1, 23) }),
    notification({ id: 'earlier', createdAt: at(30) }), notification({ id: 'morning', createdAt: at(0, 1) }),
    notification({ id: 'week', createdAt: at(6) }), notification({ id: 'recent', createdAt: at(0, 11) }),
  ] }).items;
  const previous = JSON.stringify(items);
  const groups = groupNotifications(items, now);
  assert.deepEqual(groups.map(group => [group.key, group.data.map(item => item.id)]), [
    ['today', ['recent', 'morning']], ['yesterday', ['yesterday']], ['week', ['week']], ['month', ['month']], ['earlier', ['earlier']],
  ]);
  assert.equal(JSON.stringify(items), previous);
  assert.deepEqual(groupNotifications([], now), []);
});

test('calendar grouping stays correct across daylight-saving changes and omits empty periods', () => {
  const now = new Date(2026, 9, 26, 0, 5).getTime();
  const rows = parseNotifications({ items: [notification({ createdAt: new Date(2026, 9, 25, 0, 10).toISOString() })] }).items;
  assert.deepEqual(groupNotifications(rows, now).map(group => group.key), ['yesterday']);
});

test('friend-request buttons belong only to the latest notice for a real pending request', () => {
  const items = parseNotifications({ items: [
    notification({ id: 'old', actorId: 'a' }),
    notification({ id: 'latest', actorId: 'a', createdAt: '2026-10-08T16:00:00Z' }),
    notification({ id: 'resolved', actorId: 'b' }), notification({ id: 'unknown' }),
    notification({ id: 'other-kind', type: 'friend_accepted', actorId: 'c' }),
  ] }).items;
  assert.deepEqual([...pendingRequestNotifications(items, ['a', 'c'])], ['latest']);
  assert.deepEqual([...pendingRequestNotifications(items, [])], []);
});

test('declining removes only the server-confirmed interaction and adjusts unread count exactly once', () => {
  const original = parseNotifications({ unreadCount: 20, items: [
    notification({ id: 'declined', actorId: 'same-friend' }),
    notification({ id: 'older-interaction', actorId: 'same-friend', isRead: true }),
    notification({ id: 'other-kind', actorId: 'same-friend', type: 'friend_accepted' }),
    notification({ id: 'someone-else', actorId: 'another-friend' }),
  ] });
  const updated = removeNotifications(original, ['declined', 'declined'])!;
  assert.deepEqual(updated.items.map(item => item.id), ['older-interaction', 'other-kind', 'someone-else']);
  assert.equal(updated.unreadCount, 19);
  assert.equal(original.items.length, 4);
  assert.equal(removeNotifications(updated, ['declined']), updated);
  assert.equal(removeNotifications(undefined, ['declined']), undefined);
});
test('notification responses handle empty lists and reject malformed envelopes', () => {
  for (const items of [[], null, undefined]) assert.deepEqual(parseNotifications({ items, unreadCount: 0 }), { items: [], unreadCount: 0 });
  for (const value of [null, undefined, [], 'bad', { items: 'bad' }]) assert.throws(() => parseNotifications(value));
  assert.deepEqual(parseNotifications({ items: [null, notification({ id: null }), notification({ type: undefined }), notification({ createdAt: 'bad' }), notification({ isRead: 'false' })] }).items, []);
});
test('notification read count includes unread rows outside the current page and never goes negative', () => {
  const data = parseNotifications({ items: [notification(), notification({ id: 'notice-2', isRead: true }), notification()], unreadCount: 50 });
  assert.equal(data.items.length, 2);
  const next = markNotificationRead(data, 'notice-1')!;
  assert.equal(next.unreadCount, 49); assert.equal(next.items[0]!.isRead, true);
  assert.equal(data.items[0]!.isRead, false, 'Keep previous cache immutable');
  assert.equal(markNotificationRead(next, 'notice-1'), next, 'Concurrent completion cannot decrement twice');
  assert.equal(markNotificationRead(next, 'missing'), next);
  assert.equal(markNotificationRead(undefined, 'notice-1'), undefined);
  for (const unreadCount of [null, undefined, NaN, -1, Infinity, 0.1, '8']) {
    const safe = parseNotifications({ items: [notification()], unreadCount });
    assert.equal(safe.unreadCount, 1); assert.equal(markNotificationRead(safe, 'notice-1')!.unreadCount, 0);
  }
});
test('safety notifications keep their group destination and event/profile fallback matches the web app', () => {
  const parse = (extra: Record<string, unknown>) => parseNotifications({ items: [notification(extra)] }).items[0]!;
  for (const type of ['safety_group_invite', 'safety_help', 'safety_help_resolved']) assert.deepEqual(notificationDestination(parse({ type, eventId: 'event-1', actorId: 'actor-1' })), { kind: 'safety', id: 'event-1' });
  assert.deepEqual(notificationDestination(parse({ type: 'ticket_purchased', eventId: 'event-1', actorId: 'actor-1' })), { kind: 'event', id: 'event-1' });
  assert.deepEqual(notificationDestination(parse({ actorId: 'actor-1' })), { kind: 'profile', id: 'actor-1' });
  assert.equal(notificationDestination(parse({ actorId: null, eventId: [] })), null);
});
test('shared notification copy and elapsed time use the currently selected language', () => {
  const now = Date.parse('2026-10-07T16:00:00Z'), item = parseNotifications({ items: [notification({ type: 'ticket_purchased' })] }).items[0]!;
  for (const language of ['ro', 'en'] as const) {
    const copy = (key: string, values?: Record<string, string | number>) => productCopy(language, key, values);
    assert.equal(notificationText(item, copy).title, language === 'ro' ? 'Biletele tale sunt confirmate' : 'Your tickets are confirmed');
    const date = (value: string) => formatDate(value, language, false, { deviceTime: true });
    const relative = (elapsed: number) => formatNotificationTime(new Date(now - elapsed).toISOString(), copy, date, now);
    assert.equal(relative(-1000), language === 'ro' ? 'acum' : 'now');
    assert.equal(relative(60_000), '1m'); assert.equal(relative(3_600_000), '1h');
    const old = '2026-03-07T16:00:00Z';
    assert.equal(formatNotificationTime(old, copy, date, now), date(old));
    const full = formatDate(old, language, false, { year: true, deviceTime: true });
    assert.match(full, /2026/); assert.match(full, language === 'ro' ? /mar/ : /Mar/);
    const midnight = '2026-03-07T22:30:00Z';
    assert.equal(date(midnight), new Intl.DateTimeFormat(language === 'ro' ? 'ro-RO' : 'en-GB', { day: 'numeric', month: 'short' }).format(new Date(midnight)), 'Social dates use device time like the original app');
  }
});
