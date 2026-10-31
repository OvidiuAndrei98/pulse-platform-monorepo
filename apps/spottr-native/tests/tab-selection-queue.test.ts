import assert from 'node:assert/strict';
import test from 'node:test';
import { createTabSelectionQueue } from '../src/navigation/tabSelectionQueue';

test('a blocked JS frame commits only the latest tab from a burst of touches', () => {
  const frames = new Map<number, () => void>(), commits: string[] = [];
  const queue = createTabSelectionQueue<string>(value => commits.push(value), callback => { frames.set(1, callback); return 1; }, id => frames.delete(id));
  queue.select('Profile'); queue.select('Home'); queue.select('Explore'); queue.select('Feed');
  assert.equal(frames.size, 1); assert.deepEqual(commits, []);
  frames.get(1)!(); frames.clear();
  assert.deepEqual(commits, ['Feed']);
  queue.select('Profile'); frames.get(1)!();
  assert.deepEqual(commits, ['Feed', 'Profile']);
});

test('leaving a session discards a pending tab and a later selection can schedule again', () => {
  const frames = new Map<number, () => void>(), commits: number[] = [];
  const queue = createTabSelectionQueue<number>(value => commits.push(value), callback => { frames.set(1, callback); return 1; }, id => frames.delete(id));
  queue.select(3); queue.clear(); assert.equal(frames.size, 0); assert.deepEqual(commits, []);
  queue.select(0); frames.get(1)!(); assert.deepEqual(commits, [0]);
});
