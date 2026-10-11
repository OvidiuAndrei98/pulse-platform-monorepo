import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, parseFriends, groupFeedItems } from '../src/social/data';

const activity = (extra: Record<string, unknown> = {}) => ({ activityType: 'friend_going', actorId: 'friend-a', actorUsername: 'Alex', eventId: 'event-a', eventTitle: 'After Dark', eventStartTime: '2026-10-09T20:00:00Z', occurredAt: '2026-10-07T20:00:00Z', ...extra });
test('social empty and malformed responses cannot crash list rendering', () => {
  for (const value of [null, undefined, []]) { assert.deepEqual(parseFriends(value), []); assert.deepEqual(parseFeed(value), []); }
  for (const value of [{}, 'invalid', 123]) { assert.throws(() => parseFeed(value)); assert.throws(() => parseFriends(value)); }
  assert.deepEqual(parseFriends([null, {id:'a',username:null}, {id:'',username:'Alex'}]), []);
  assert.deepEqual(parseFeed([null, activity({activityType:'unknown'}), activity({occurredAt:'bad'}), activity({eventStartTime:undefined}), activity({eventTitle:null})]), []);
});
test('friends are deduplicated by identity and optional malformed text is ignored', () => {
  assert.deepEqual(parseFriends([{id:'a',username:'Old'}, {id:'a',username:'Alex',avatarUrl:null,bio:[]}, {id:'b',username:'Bea',bio:'Techno'}]), [{id:'a',username:'Alex',avatarUrl:undefined,bio:undefined},{id:'b',username:'Bea',avatarUrl:undefined,bio:'Techno'}]);
});
test('original feed grouping chooses a ticket over RSVP without duplicating a friend', () => {
  const rows = parseFeed([activity(), activity({activityType:'friend_ticket',occurredAt:'2026-10-07T19:00:00Z'}), activity({actorId:'friend-b',actorUsername:'Bea'})]);
  const before = JSON.stringify(rows), result = groupFeedItems(rows);
  assert.equal(result.length,1); assert.equal(result[0]!.actors.length,2); assert.equal(result[0]!.ticketActors.length,1); assert.equal(result[0]!.goingActors.length,1);
  assert.equal(JSON.stringify(rows),before,'Grouping must not change cached API rows');
});
test('organizer updates remain distinct and newest activity sorts first', () => {
  const result = groupFeedItems(parseFeed([activity(), activity({activityType:'organizer_update',organizerUpdateId:'one',occurredAt:'2026-10-07T21:00:00Z'}), activity({activityType:'organizer_update',organizerUpdateId:'two',occurredAt:'2026-10-07T22:00:00Z'}), activity({activityType:'organizer_update'})]));
  assert.deepEqual(result.map(group=>group.organizerUpdateId),['two','one',undefined]);
  assert.equal(groupFeedItems(parseFeed([activity(),activity({occurredAt:'2026-10-07T22:00:00Z'})]))[0]!.actors[0]!.occurredAt,'2026-10-07T22:00:00Z');
});
