const assert = require('node:assert/strict');
const { test } = require('node:test');
const { modules } = require('./helpers/qaHarness.cjs');
const { formatToDatetimeLocal } = modules().load('features/events/form/dateTimeValues');

test('organizer picker matches the local card time and saving does not shift event timestamps', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Bucharest';
    for (const [stored, displayed] of [
      ['2026-10-06T12:00:00Z', '2026-10-06T15:00'],
      ['2026-10-31T22:25:00Z', '2026-11-01T00:25'],
      ['2026-01-06T12:00:00Z', '2026-01-06T14:00'],
      ['2026-10-06T12:00:00+03:00', '2026-10-06T12:00'],
      ['2026-03-29T00:30:00Z', '2026-03-29T02:30'],
      ['2026-03-29T01:30:00Z', '2026-03-29T04:30'],
    ]) {
      const local = formatToDatetimeLocal(stored);
      assert.equal(local, displayed);
      assert.equal(new Date(local).getTime(), new Date(stored).getTime(), 'Saving unchanged dates must preserve their instant');
      assert.equal(local.slice(11), new Date(stored).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',hour12:false}));
    }
    process.env.TZ = 'America/New_York';
    assert.equal(formatToDatetimeLocal('2026-10-06T02:00:00Z'), '2026-10-05T22:00');
    process.env.TZ = 'UTC';
    assert.equal(formatToDatetimeLocal('2026-10-06T12:00:00Z'), '2026-10-06T12:00');
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('missing and invalid API dates produce an empty picker value', () => {
  for (const value of [undefined, null, '', 'not-a-date']) assert.equal(formatToDatetimeLocal(value), '');
});
