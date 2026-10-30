import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortValidationEvents } from '@packages/api-client/src/validationEventSelection';
import { mergeValidationEvents } from '../src/scanner/data';

test('validation list keeps current admissions first, upcoming chronologically and offline journals reachable', () => {
  const event = (id: string, startTime: string, endTime: string) => ({ id, startTime, endTime });
  const rows = [
    event('later', '2026-11-20', '2026-11-21'),
    event('journal-old', '2026-09-01', '2026-09-02'),
    event('next', '2026-11-02', '2026-11-03'),
    event('live', '2026-10-30T10:00:00Z', '2026-10-30T23:00:00Z'),
    event('journal-new', '2026-10-29', '2026-10-30T08:00:00Z'),
  ];
  assert.deepEqual(sortValidationEvents(rows, Date.parse('2026-10-30T12:00:00Z')).map(e => e.id), ['live', 'next', 'later', 'journal-new', 'journal-old']);
  assert.equal(rows[0]!.id, 'later', 'Sorting must not mutate the shared query cache');
  assert.deepEqual(sortValidationEvents([], 0), []);
  assert.equal(sortValidationEvents([rows[0]!], 0).length, 1);
});

test('local journals cannot grant management; a current server response can', () => {
  const event = { id: 'event', title: 'QA', startTime: '2026-10-30', endTime: '2026-10-31', status: 'published', locationName: '', canManage: true };
  assert.equal(mergeValidationEvents([], [event])[0]!.canManage, false);
  assert.equal(mergeValidationEvents([event], [event])[0]!.canManage, true);
  assert.equal(mergeValidationEvents([{ ...event, canManage: false }], [event])[0]!.canManage, false);
  assert.equal(event.canManage, true, 'The durable journal must not be mutated');
});
