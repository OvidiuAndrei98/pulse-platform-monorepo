import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GroupsStore, type FriendGroup, type GroupMessage } from '../src/social/groups';
import { groupConversationRows, isCanonicalGroupReference } from '../src/social/groupPresentation';
import type { OutingPlan, OutingsRequest } from '../src/outings/model';
import { translate } from '../src/i18n/translate';

const id = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`;
const groupId = id(1), owner = id(2), sender = id(3), eventId = id(4);
const source: GroupMessage = {
  id: id(5), requestId: id(6), seq: 1, senderId: sender, username: 'Member', kind: 'event', content: '', eventId,
  createdAt: '2026-11-16T10:00:00Z',
  event: { id: eventId, title: 'Party', imageUrl: '', location: 'Venue', city: 'Bucuresti', startTime: '2026-11-20T20:00:00Z', endTime: '2026-11-21T03:00:00Z', status: 'published' },
};
const plan: OutingPlan = {
  id: id(7), groupId, ownerId: owner, title: 'Night', status: 'accepted', revision: 1, decisionRound: 1,
  city: 'Bucuresti', outingDate: '2026-11-20', chosenEventId: eventId, expiresAt: '2026-11-21T04:00:00Z',
  members: [{ userId: owner, username: 'Owner', status: 'accepted', hasTicket: false }, { userId: sender, username: 'Member', status: 'accepted', hasTicket: false }],
  options: [{ eventId, title: 'Party', location: 'Venue', startTime: source.event!.startTime, available: true, referenceMessageId: source.id }],
};
const group: FriendGroup = {
  id: groupId, name: 'Friends', ownerId: owner, status: 'accepted', revision: 1, lastSeq: 1, unread: 0,
  muted: false, visibleAfterSeq: 0, joinedAt: '2026-11-15T10:00:00Z', members: plan.members, outings: [], outingsHasMore: false,
};
const linked = { ...source, outingId: plan.id, referenceMessageId: source.id };
const audit: GroupMessage = { ...linked, id: id(8), requestId: id(9), seq: 2, kind: 'outing', senderId: owner, username: 'Owner', createdAt: '2026-11-16T10:01:00Z' };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('Propose refresh is not lost behind an older in-flight message poll', async () => {
  let serial = 100, reads = 0, created = false, releaseOld!: (value: unknown) => void;
  const pendingPoll = new Promise(resolve => { releaseOld = resolve; });
  const postBodies: Record<string, unknown>[] = [];
  const store = new GroupsStore((async (path, method, body) => {
    if (method === 'POST') { created = true; postBodies.push(body as Record<string, unknown>); return plan; }
    if (path.includes('/messages')) {
      reads++;
      if (reads === 2) return pendingPoll;
      return { items: created ? [audit, linked] : [source], hasMore: false };
    }
    return { ...group, revision: created ? 2 : 1, lastSeq: created ? 2 : 1, outings: created ? [plan] : [] };
  }) as OutingsRequest, () => true, () => id(serial++));

  await store.load(groupId);
  const oldPoll = store.loadMessages(groupId);
  const result = await store.createOuting(groupId, { eventId, sourceMessageId: source.id });
  assert.equal(result?.id, plan.id);
  assert.equal(postBodies[0]?.sourceMessageId, source.id);
  releaseOld({ items: [source], hasMore: false });
  await oldPoll;
  await flush();

  const state = store.getSnapshot();
  const current = state.messages[groupId]!.find(message => message.id === source.id)!;
  assert.equal(current.outingId, plan.id, 'The explicit source must refresh without waiting for another external poll');
  assert.equal(current.referenceMessageId, source.id);
  assert.equal(current.senderId, sender);
  assert.equal(current.createdAt, source.createdAt);
  assert.equal(reads, 3, 'One coalesced fresh request follows the stale in-flight response');
  const rows = groupConversationRows(state.messages[groupId]!, state.groups[0]!.outings);
  assert.equal(rows.filter(row => row.kind === 'message' && isCanonicalGroupReference(row.message)).length, 1);
  assert.equal(rows.filter(row => row.kind === 'updates').length, 1);
  store.dispose();
});

test('compact ticket-drawer labels and direct responses exist in both supported languages', () => {
  for (const language of ['en', 'ro'] as const) {
    for (const name of ['ticketEntry', 'ticketsForYou', 'ticketsForWho', 'ticketType', 'selectTicketType', 'pricePerPerson', 'ticketSelectionRequired', 'ticketsYou', 'ticketSelectionUnavailable', 'continueTickets', 'ticketRecipientLimit', 'comingYes', 'comingNo']) {
      const key = 'groups.' + name;
      const text = translate(language, key, { price: '50 RON', count: 8 });
      assert.notEqual(text, key);
      assert.doesNotMatch(text, /\{\{/);
    }
  }
  assert.equal(translate('ro', 'groups.comingYes'), 'Vin');
  assert.equal(translate('ro', 'groups.comingNo'), 'Nu vin');
});
