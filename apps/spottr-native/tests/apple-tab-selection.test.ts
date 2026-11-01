import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppleTabSelection } from '../src/navigation/appleTabSelection';

test('route acknowledgements never replay a previous tab over a newer native selection', () => {
  const selection = createAppleTabSelection(0);
  selection.begin(1); selection.begin(3); selection.begin(2);
  assert.equal(selection.acknowledge(1), false);
  assert.equal(selection.acknowledge(3), false);
  assert.equal(selection.acknowledge(2), false);
  assert.equal(selection.acknowledge(0), true, 'An external Back still updates UIKit');
});

test('repeated destinations in a rapid burst consume acknowledgements in order', () => {
  const selection = createAppleTabSelection(0);
  for (const index of [1, 0, 1]) selection.begin(index);
  for (const index of [1, 0, 1]) assert.equal(selection.acknowledge(index), false);
  assert.equal(selection.acknowledge(3), true);
});

test('coalesced route updates can skip intermediate selections', () => {
  const selection = createAppleTabSelection(0);
  for (const index of [1, 2, 3]) selection.begin(index);
  assert.equal(selection.acknowledge(3), false);
  assert.equal(selection.acknowledge(2), true, 'No stale pending request blocks external navigation');
});

test('a rejected native selection restores the latest confirmed route', () => {
  const selection = createAppleTabSelection(0);
  selection.begin(1); selection.acknowledge(1);
  selection.begin(3);
  assert.equal(selection.reject(), 1);
  assert.equal(selection.acknowledge(3), true, 'A later external route can select the rejected tab');
});
