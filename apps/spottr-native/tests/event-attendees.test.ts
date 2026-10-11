import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEventFriends } from '../src/social/eventAttendeesData';
const attendee = (extra: Record<string, unknown> = {}) => ({ id: '11111111-1111-4111-8111-111111111111', username: 'Friend', role: 'user', relationship: 'friends', attendanceStatus: 'has_ticket', ...extra });
test('event friends only includes confirmed friends with valid attendance', () => {
  assert.equal(parseEventFriends([attendee(),attendee({relationship:'none'}),attendee({relationship:'pending_received'}),attendee({attendanceStatus:'interested'})]).length,1);
  assert.deepEqual(parseEventFriends([null,attendee({id:'../wrong'}),attendee({username:null}),attendee({relationship:undefined})]),[]);
});
test('event attendees accepts empty Go slices, deduplicates identity and sanitizes avatar', () => {
  assert.deepEqual(parseEventFriends(null),[]); assert.throws(()=>parseEventFriends({}));
  const rows=parseEventFriends([attendee(),attendee({username:'New',avatarUrl:'javascript:alert(1)',attendanceStatus:'going'})]);
  assert.equal(rows.length,1);assert.equal(rows[0]?.username,'New');assert.equal(rows[0]?.attendanceStatus,'going');assert.equal(rows[0]?.avatarUrl,undefined);
});
