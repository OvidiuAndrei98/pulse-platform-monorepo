import test from 'node:test';
import assert from 'node:assert/strict';
import { canSafetyAction, createSafetyApi, parseSafetyEnvelope, selectedSafetyFriends, type SafetyEnvelope } from '../src/safety/data';
import { SafetyController } from '../src/safety/controller';
import { ApiError, createHttp } from '../src/data/http';
const uuid = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const event = uuid(1), viewer = uuid(2), other = uuid(3);
const friend = (n: number) => ({ userId: uuid(n), username: 'Friend ' + n });
const empty = (): SafetyEnvelope => ({ canCreate: true, ticketValidated: false, eligibleFriends: [friend(3), friend(4)] });
const accepted = (): SafetyEnvelope => ({ canCreate: false, ticketValidated: true, eligibleFriends: [friend(4)], group: {
  id: uuid(5), eventId: event, ownerId: viewer, eventTitle: 'Event', eventLocation: 'Venue', startTime: '2026-10-10T20:00:00Z', endTime: '2026-10-11T04:00:00Z', expiresAt: '2026-10-12T04:00:00Z', currentMemberStatus: 'accepted', canSendHelp: true, currentUserNeedsHelp: false,
  members: [{ ...friend(2), status: 'accepted' }, { ...friend(3), status: 'accepted' }], messages: [],
} });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
function setup(load: ReturnType<typeof createSafetyApi>['load'] = async () => accepted(), change: ReturnType<typeof createSafetyApi>['change'] = async () => {}) {
  let session = true;
  const controller = new SafetyController(event, viewer, 'account-token', { load, change }, () => session);
  return { controller, logout: () => { session = false; } };
}
test('safety parses empty Go slices and canonical IDs without unsafe avatars', () => {
  assert.deepEqual(parseSafetyEnvelope({ ...empty(), eligibleFriends: null, group: null }, event), { canCreate: true, ticketValidated: false, eligibleFriends: [] });
  const data = accepted(); data.eligibleFriends = [{ ...friend(4), avatarUrl: 'javascript:alert(1)' }, friend(4)];
  assert.equal(parseSafetyEnvelope(data, event.toUpperCase()).eligibleFriends.length, 1);
  assert.equal(parseSafetyEnvelope(data, event).eligibleFriends[0]?.avatarUrl, undefined);
});
test('safety never guesses malformed permissions, relationships, dates or wrong event', () => {
  const data = accepted();
  for (const input of [null, [], {}, { ...data, canCreate: 'true' }, { ...data, group: { ...data.group, eventId: uuid(9) } }, { ...data, group: { ...data.group, expiresAt: 'bad' } }, { ...data, group: { ...data.group, currentMemberStatus: 'other' } }, { ...data, group: { ...data.group, members: [{ ...friend(2), status: 'declined' }] } }]) assert.throws(() => parseSafetyEnvelope(input, event));
});
test('safety selection revalidates eligibility, dedupes and counts pending capacity', () => {
  const data = empty(); data.eligibleFriends = Array.from({length:10},(_,i)=>friend(i+10));
  assert.equal(selectedSafetyFriends(data, data.eligibleFriends.map(v=>v.userId)).length, 7);
  assert.deepEqual(selectedSafetyFriends(data, [uuid(10), uuid(10), 'bad']), [uuid(10)]);
  data.group = accepted().group; data.group!.members = Array.from({length:7},(_,i)=>({...friend(i+20),status:'pending' as const}));
  assert.equal(selectedSafetyFriends(data, data.eligibleFriends.map(v=>v.userId)).length, 1);
});
test('safety gates create/invite/respond/help using authoritative permissions', () => {
  assert.equal(canSafetyAction(empty(), {kind:'create',friendIds:[other]}, viewer), true);
  assert.equal(canSafetyAction({...empty(),canCreate:false}, {kind:'create',friendIds:[other]}, viewer), false);
  assert.equal(canSafetyAction(empty(), {kind:'create',friendIds:[other,other]}, viewer), false);
  const data = accepted();
  assert.equal(canSafetyAction(data,{kind:'invite',friendIds:[uuid(4)]},other),false);
  assert.equal(canSafetyAction(data,{kind:'invite',friendIds:[uuid(4)]},viewer),true);
  assert.equal(canSafetyAction(data,{kind:'respond',status:'accepted'},viewer),false);
  assert.equal(canSafetyAction(data,{kind:'help',content:'Help'},viewer),true);
  data.group!.canSendHelp=false;
  assert.equal(canSafetyAction(data,{kind:'help',content:'Help'},viewer),false);
  data.group!.currentUserNeedsHelp=true;
  assert.equal(canSafetyAction(data,{kind:'help-resolved',content:'Safe'},viewer),true);
  assert.equal(canSafetyAction(data,{kind:'messages',content:' '},viewer),false);
  assert.equal(canSafetyAction(data,{kind:'messages',content:'🙂'.repeat(500)},viewer),true);
  assert.equal(canSafetyAction(data,{kind:'messages',content:'a'.repeat(501)},viewer),false);
});
test('safety HTTP uses exact API routes/bodies and explicit account token', async () => {
  const calls: {url:string;method?:string;body:unknown;token:string|null}[]=[];
  const api = createSafetyApi(createHttp('https://local.invalid/api/v1', async (input, init) => {
    calls.push({url:String(input),method:init?.method,body:init?.body?JSON.parse(String(init.body)):undefined,token:new Headers(init?.headers).get('Authorization')});
    return new Response(JSON.stringify(empty()),{status:200});
  }));
  const signal = new AbortController().signal;
  await api.load(event,'exact',signal);
  await api.change(event,{kind:'create',friendIds:[other]},'exact',signal);
  await api.change(event,{kind:'respond',status:'declined'},'exact',signal);
  await api.change(event,{kind:'messages',content:' hello '},'exact',signal);
  assert.deepEqual(calls.map(v=>v.url.split('/safety-group')[1]),['','','/respond','/messages']);
  assert.deepEqual(calls.map(v=>v.body),[undefined,{friendIds:[other]},{status:'declined'},{content:'hello'}]);
  assert.ok(calls.every(v=>v.token==='Bearer exact'));
  await assert.rejects(()=>api.load('../x','exact',signal));
});
test('safety deduplicates polls and ignores replaced reads even when transport ignores abort', async () => {
  const reads = [deferred<SafetyEnvelope>(),deferred<SafetyEnvelope>()]; let calls=0;
  const {controller}=setup(()=>reads[calls++]!.promise); controller.setActive(true);
  assert.equal(await controller.poll(),false); assert.equal(calls,1);
  const newer=controller.load(); reads[1]!.resolve(accepted()); await newer;
  reads[0]!.resolve(empty()); await tick(); assert.ok(controller.getSnapshot().data?.group); controller.setActive(false);
});
test('quiet poll failure preserves chat and recovers without full-screen loading', async () => {
  let broken=false; const {controller}=setup(async()=>{if(broken)throw new ApiError(503,'UNAVAILABLE');return accepted();});
  controller.setActive(true); await tick(); broken=true; await controller.poll();
  assert.ok(controller.getSnapshot().data?.group); assert.equal(controller.getSnapshot().connectionLost,true); assert.equal(controller.getSnapshot().pending,false); assert.equal(controller.getSnapshot().error,null);
  broken=false; await controller.poll(); assert.equal(controller.getSnapshot().connectionLost,false); controller.setActive(false);
});
test('pending invitations do not poll or send chat', async () => {
  let reads=0; const data=accepted();data.group!.currentMemberStatus='pending';
  const {controller}=setup(async()=>{reads++;return data;});controller.setActive(true);await tick();
  await controller.poll(); assert.equal(reads,1); assert.equal(await controller.run({kind:'messages',content:'x'}),false); controller.setActive(false);
});
test('double actions submit once and polls cannot race a pending write', async () => {
  const write=deferred<void>();let writes=0,reads=0;
  const {controller}=setup(async()=>{reads++;return accepted();},async()=>{writes++;await write.promise;});
  controller.setActive(true);await tick();const first=controller.run({kind:'messages',content:'hello'});
  assert.equal(await controller.run({kind:'messages',content:'hello'}),false);await controller.poll();assert.equal(reads,1);assert.equal(writes,1);
  write.resolve();assert.equal(await first,true);assert.equal(reads,2);assert.equal(controller.getSnapshot().working,false);controller.setActive(false);
});
test('logout prevents old account mutations and post-write refresh even before effect cleanup', async () => {
  const write=deferred<void>();let reads=0;
  const {controller,logout}=setup(async()=>{reads++;return accepted();},()=>write.promise);
  controller.setActive(true);await tick();const run=controller.run({kind:'help',content:'Help'});logout();write.resolve();assert.equal(await run,false);assert.equal(reads,1);assert.equal(controller.getSnapshot().notice,null);controller.setActive(false);
});
test('background/blur aborts read and write; refocus refreshes current data', async () => {
  let reads=0;let writeSignal:AbortSignal|undefined;const write=deferred<void>();
  const {controller}=setup(async()=>{reads++;return accepted();},async(_event,_action,_token,signal)=>{writeSignal=signal;await write.promise;});
  controller.setActive(true);await tick();const run=controller.run({kind:'help',content:'Help'});controller.setActive(false);assert.equal(writeSignal?.aborted,true);write.resolve();assert.equal(await run,false);assert.equal(controller.getSnapshot().working,false);
  controller.setActive(true);await tick();assert.equal(reads,2);controller.setActive(false);
});
test('failed mutations preserve chat and expose translated fallback/server validation', async () => {
  const {controller}=setup(undefined,async()=>{throw new ApiError(409,'Nu poti trimite acum');});controller.setActive(true);await tick();assert.equal(await controller.run({kind:'messages',content:'x'}),false);
  assert.equal(controller.getSnapshot().actionError?.message,'Nu poti trimite acum');assert.ok(controller.getSnapshot().data?.group);assert.equal(controller.getSnapshot().working,false);controller.setActive(false);
});
