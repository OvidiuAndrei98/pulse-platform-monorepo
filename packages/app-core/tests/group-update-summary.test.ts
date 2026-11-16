import assert from 'node:assert/strict';
import test from 'node:test';
import { translate } from '../src/i18n/translate';
import { groupUpdateSummary } from '../src/social/groupPresentation';
import type { GroupMessage } from '../src/social/groups';

const context: NonNullable<GroupMessage['outingContext']> = {
  decisionRound: 1, title: 'Friday friends', city: 'București', outingDate: '2026-11-20', candidateDates: [],
};
const before: GroupMessage = {
  id: 'earlier', requestId: 'operation-1', seq: 4, senderId: 'ana', username: 'Ana', kind: 'outing',
  content: '', outingId: 'outing-1', createdAt: '2026-11-16T10:00:00Z', outingContext: context,
};
const current = (changes: Partial<typeof context>, message: Partial<GroupMessage> = {}): GroupMessage => ({
  ...before, id: 'current', requestId: 'operation-2', seq: 5, senderId: 'radu', username: 'Radu',
  outingContext: { ...context, ...changes }, ...message,
});
const summary = (message: GroupMessage, previous: GroupMessage | undefined = before, language: 'en' | 'ro' = 'ro') =>
  groupUpdateSummary(message, previous, language, (key, values) => translate(language, key, values));

test('adjacent snapshots describe the proven field change with the current original author', () => {
  assert.equal(summary(current({ outingDate: '2026-11-21', decisionRound: 2 })), 'Radu a modificat data ieșirii.');
  assert.equal(summary(current({ city: 'Cluj-Napoca', decisionRound: 2 })), 'Radu a modificat orașul ieșirii.');
  assert.equal(summary(current({ chosenEventId: 'event-a' })), 'Radu a modificat destinația.');
  assert.equal(summary(current({ title: 'New name' })), 'Radu a redenumit ieșirea.');
  assert.equal(summary(current({ chosenEventId: 'event-a' }), before, 'en'), 'Radu changed the destination.');
  assert.equal(before.username, 'Ana', 'The earlier author and stored snapshot remain untouched');
});

test('multiple actual field changes remain explicit without claiming why a destination was cleared', () => {
  const previous = { ...before, outingContext: { ...context, chosenEventId: 'event-a' } };
  const message = current({ outingDate: '2026-11-21', city: 'Cluj-Napoca', decisionRound: 2 });
  assert.equal(summary(message, previous), 'Radu a actualizat ieșirea: data · orașul · destinația.');
});

test('missing, non-adjacent, other-outing, reversed or skipped-round snapshots use a generic summary', () => {
  const changed = current({ outingDate: '2026-11-21', decisionRound: 2 });
  for (const previous of [
    undefined,
    { ...before, outingContext: undefined },
    { ...before, seq: 2 },
    { ...before, outingId: 'other-outing' },
    { ...before, seq: 6 },
    { ...before, outingContext: { ...context, decisionRound: 3 } },
  ]) {
    assert.equal(groupUpdateSummary(changed, previous, 'ro', (key, values) => translate('ro', key, values)), 'Radu a actualizat ieșirea.');
  }
  assert.equal(summary(current({ outingDate: '2026-11-21', decisionRound: 3 })), 'Radu a actualizat ieșirea.');
});

test('normalized city and reordered candidate nights do not invent changes', () => {
  const previous = { ...before, outingContext: { ...context, candidateDates: ['2026-11-20', '2026-11-21'] } };
  assert.equal(summary(current({ city: 'Bucuresti', candidateDates: ['2026-11-21', '2026-11-20'] }), previous), 'Radu a actualizat ieșirea.');
});

test('missing author, non-outing messages and unchanged snapshots never invent an actor or RSVP', () => {
  assert.equal(summary(current({ outingDate: '2026-11-21' }, { username: '' })), 'Ieșirea a fost actualizată.');
  assert.equal(summary(current({ chosenEventId: 'event-a' }, { kind: 'text' })), 'Radu a actualizat ieșirea.');
  assert.equal(summary(current({ chosenEventId: 'event-a' }), { ...before, kind: 'text' }), 'Radu a actualizat ieșirea.');
  assert.equal(summary(current({})), 'Radu a actualizat ieșirea.');
  assert.equal(translate('ro', 'groups.proposeOuting'), 'Propune ieșirea');
  assert.equal(translate('en', 'groups.proposeOuting'), 'Propose outing');
});
