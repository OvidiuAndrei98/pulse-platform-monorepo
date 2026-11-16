import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { groupConversationRows, isCanonicalGroupReference, referencedGroupOuting, pinnedOutingPresentation } from '../src/social/groupPresentation';
import { preferredGroupOuting, type GroupMessage } from '../src/social/groups';
import { translate } from '../src/i18n/translate';
import type { OutingPlan } from '../src/outings/model';

const id = (n: number) => `88888888-8888-4888-8888-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-11-15T12:00:00Z');
const en = (key: string, values?: Record<string, string | number>) => translate('en', key, values);
const plan = (patch: Partial<OutingPlan> = {}): OutingPlan => ({
  id: id(20), groupId: id(1), ownerId: id(2), title: '2026-11-20', status: 'accepted',
  revision: 5, decisionRound: 4, city: 'Bucuresti', outingDate: '2026-11-20', expiresAt: '2026-11-21T04:00:00Z',
  members: [{ userId: id(2), username: 'Ana', status: 'accepted', hasTicket: false }],
  options: [], candidateDates: [{ date: '2026-11-20', responses: [] }], ...patch,
});
const message = (seq: number, patch: Partial<GroupMessage> = {}): GroupMessage => ({
  id: id(100 + seq), requestId: id(200 + seq), seq, kind: 'outing', content: '', outingId: id(20),
  senderId: id(seq % 2 ? 2 : 3), username: seq % 2 ? 'Ana' : 'Radu', createdAt: `2026-11-15T12:${String(seq).padStart(2, '0')}:00Z`,
  outingContext: { title: '2026-11-18', city: 'Bucuresti', decisionRound: 1, outingDate: '2026-11-18', candidateDates: ['2026-11-18'] }, ...patch,
});

test('history grouping preserves both list directions and every original author, timestamp and snapshot', () => {
  const originals = [message(1), message(2), message(3)];
  for (const input of [originals, [...originals].reverse()]) {
    const rows = groupConversationRows(input, [plan()]);
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.equal(row.kind, 'updates');
    if (row.kind !== 'updates') throw new Error('missing grouped history');
    assert.equal(row.id, 'outing-updates:' + originals[0]!.id);
    assert.equal(row.count, 3);
    assert.equal(row.firstAt, originals[0]!.createdAt);
    assert.equal(row.lastAt, originals[2]!.createdAt);
    assert.equal('senderId' in row, false);
    row.messages.forEach((child, index) => assert.equal(child, input[index]));
    assert.deepEqual(row.messages.map(child => child.username), input.map(child => child.username));
  }
});

test('appending a newer historical version keeps the existing conversation anchor key', () => {
  const initial = groupConversationRows([message(2), message(1)], [plan()]);
  const next = groupConversationRows([message(3), message(2), message(1)], [plan()]);
  assert.equal(initial[0]!.id, next[0]!.id);
});

test('history never crosses ordinary messages, shared events, another outing, current invitations or unloaded gaps', () => {
  const p = plan();
  const current = message(6, { outingContext: { title: p.title, city: p.city!, outingDate: p.outingDate, decisionRound: p.decisionRound!, candidateDates: ['2026-11-20'] } });
  const input = [message(1), message(2), message(3, { kind: 'text', content: 'See you there', outingId: undefined, outingContext: undefined }), message(4), message(5, { kind: 'event', eventId: id(30), outingId: undefined, outingContext: undefined }), current, message(7), message(8, { outingId: id(21) }), message(10), message(11)];
  const rows = groupConversationRows(input, [p, plan({ id: id(21) })]);
  assert.deepEqual(rows.map(row => row.kind === 'updates' ? row.messages.map(child => child.seq) : [row.message.seq]), [[1, 2], [3], [4], [5], [6], [7], [8], [10, 11]]);
  assert.deepEqual(rows.flatMap(row => row.kind === 'updates' ? row.messages : [row.message]), input);
});

test('unresolved outings remain individual messages instead of being falsely classified as historical', () => {
  const input = [message(1), message(2)];
  assert.deepEqual(groupConversationRows(input, []).map(row => row.kind), ['message', 'message']);
  assert.deepEqual(groupConversationRows([message(1, { outingContext: undefined }), message(2, { outingContext: undefined })], [plan()])[0]?.kind, 'updates');
});

test('the pinned outing is deterministic and ignores navigation order, invitations and expired context', () => {
  const nearest = plan();
  const december = plan({ id: id(21), outingDate: '2026-12-03', expiresAt: '2026-12-04T04:00:00Z' });
  const excluded = [
    plan({ id: id(22), status: 'pending', outingDate: '2026-11-16' }),
    plan({ id: id(23), lifecycle: 'completed', outingDate: '2026-11-16' }),
    plan({ id: id(24), lifecycle: 'cancelled', outingDate: '2026-11-16' }),
    plan({ id: id(25), expiresAt: '2026-11-14T04:00:00Z', outingDate: '2026-11-13' }),
  ];
  for (const input of [[december, ...excluded, nearest], [nearest, ...excluded, december]]) {
    assert.equal(preferredGroupOuting(input, now)?.id, nearest.id);
    assert.equal(pinnedOutingPresentation(input, 'en', en, now)?.eligibleCount, 2);
  }
  assert.equal(preferredGroupOuting(excluded, now), undefined);
});

test('pin time ordering uses the Bucharest 06:00 boundary, including winter and summer offsets', () => {
  for (const [day, timestamp, eventStart] of [
    ['2026-11-15', '2026-11-15T04:30:00Z', '2026-11-15T05:00:00Z'],
    ['2027-03-28', '2027-03-28T03:30:00Z', '2027-03-28T04:00:00Z'],
  ]) {
    const night = plan({ outingDate: day, expiresAt: day + 'T23:59:00Z' });
    const event = plan({ id: id(21), chosenEventId: id(30), outingDate: day, expiresAt: day + 'T23:59:00Z', options: [{ eventId: id(30), title: 'Later event', startTime: eventStart!, available: true }] });
    assert.equal(preferredGroupOuting([event, night], Date.parse(timestamp!))?.id, night.id);
  }
});

test('pinned comparison has one date and never presents its first proposal as confirmed', () => {
  const p = plan({ options: [{ eventId: id(30), title: 'Not selected', startTime: '2026-11-20T21:00:00Z', available: true }] });
  const summary = pinnedOutingPresentation([p], 'en', en, now)!;
  assert.match(summary.title, /20/);
  assert.equal(summary.event, undefined);
  assert.equal(summary.subtitle, 'Bucuresti · Choosing the destination');
  assert.doesNotMatch(summary.title + summary.subtitle, /Not selected|2026-11-20/);
  const empty = pinnedOutingPresentation([plan()], 'en', en, now)!;
  assert.equal(empty.subtitle, 'Bucuresti · No suggestions yet');
  assert.doesNotMatch(empty.subtitle, /0|error|failed/i);
  const chosen = pinnedOutingPresentation([{ ...p, chosenEventId: id(30) }], 'en', en, now)!;
  assert.equal(chosen.title, 'Not selected');
  assert.equal(chosen.event, p.options[0]);
  assert.match(chosen.subtitle, /20.* · Bucuresti/);
});

test('history copy counts versions without inventing change types or attributing a single author', () => {
  assert.equal(en('groups.historyVersions', { count: 3 }), 'Outing history · 3 versions');
  assert.equal(translate('ro', 'groups.historyVersions', { count: 1 }), 'Istoricul ieșirii · 1 versiune');
  assert.equal(translate('ro', 'groups.moreOutings', { count: 2 }), 'Încă 2 ieșiri');
});

test('a shared source evolves only through its explicit outing reference and audits stay compact', () => {
  const canonical = message(1, { kind: 'event', eventId: id(30), referenceMessageId: id(101), event: { id: id(30), title: 'The actual occurrence', imageUrl: '', location: 'Venue', city: 'Bucuresti', startTime: '2026-11-20T20:00:00Z', endTime: '2026-11-21T03:00:00Z', status: 'published' } });
  const audit = message(2, { eventId: id(30), referenceMessageId: canonical.id });
  const unbound = message(3, { kind: 'event', eventId: id(30), outingId: undefined, outingContext: undefined });
  const another = plan({ id: id(21), options: [{ eventId: id(30), title: 'The actual occurrence', location: 'Venue', startTime: '2026-11-20T20:00:00Z', available: true }] });
  const p = plan({ options: [{ ...another.options[0]!, referenceMessageId: canonical.id }] });
  assert.equal(isCanonicalGroupReference(canonical), true);
  assert.equal(isCanonicalGroupReference(audit), false);
  assert.equal(referencedGroupOuting(canonical, [another, p]), p);
  assert.equal(referencedGroupOuting(unbound, [another, p]), undefined);
  const rows = groupConversationRows([unbound, audit, canonical], [p, another]);
  assert.deepEqual(rows.map(row => row.kind), ['message', 'updates', 'message']);
  assert.deepEqual(rows.flatMap(row => row.kind === 'updates' ? row.messages : [row.message]), [unbound, audit, canonical]);
  assert.equal(canonical.username, 'Ana');
  assert.equal(rows[1]?.kind === 'updates' && 'senderId' in rows[1], false);
  assert.equal(groupConversationRows([audit], [])[0]?.kind, 'updates', 'Unloaded canonical context never turns its audit into another poster');
  const contextUpdate=message(4,{outingContext:{title:p.title,city:p.city!,outingDate:p.outingDate,decisionRound:p.decisionRound!,candidateDates:[p.outingDate!]}});
  assert.equal(groupConversationRows([contextUpdate],[p])[0]?.kind,'updates','Reopening or changing the night must not create another live comparison card');
});
