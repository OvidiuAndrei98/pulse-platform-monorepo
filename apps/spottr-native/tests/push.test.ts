import test from 'node:test';
import assert from 'node:assert/strict';
import { PushRegistry, parsePushRegistration, pushNotificationID, type PushRegistration } from '../src/notifications/pushRegistry';

const userId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const projectId = '33333333-3333-4333-8333-333333333333';
const identity = { userId, token: 'session-fixture', language: 'ro' as const };
const device = { token: 'ExpoPushToken[abcdefghijklmnop]', projectId, platform: 'ios' as const };
const registration = { token: device.token, secret: 'a'.repeat(64), userId, projectId };
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
function fixture(initial: PushRegistration | null = null) {
  let saved = initial;
  const calls: string[] = [];
  const dependencies = {
    read: async () => saved, write: async (value: PushRegistration | null) => { saved = value; calls.push(value ? 'save' : 'clear'); },
    secret: () => 'b'.repeat(64),
    register: async (value: PushRegistration) => { assert.equal(saved?.userId, value.userId); assert.equal(saved?.secret, value.secret); calls.push('register:' + value.userId); },
    unregister: async (value: PushRegistration) => { calls.push('unregister:' + value.userId); },
  };
  return { registry: new PushRegistry(dependencies), dependencies, calls, saved: () => saved };
}
test('push registration commits a revocation capability before its first network request', async () => {
  const f = fixture();
  f.dependencies.register = async value => { assert.deepEqual(f.saved(), { ...registration, secret: value.secret }); f.calls.push('register'); };
  assert.equal(await f.registry.sync(identity, async () => device), true);
  assert.deepEqual(f.calls, ['save', 'register']);
  assert.equal(await f.registry.sync(null, async () => { throw Error('must not ask permissions after logout'); }), false);
  assert.deepEqual(f.calls.slice(2), ['unregister:' + userId, 'clear']); assert.equal(f.saved(), null);
});
test('logout during permission/token acquisition never registers the old account', async () => {
  const f = fixture(), gate = deferred(), started = deferred();
  const first = f.registry.sync(identity, async () => { started.resolve(); await gate.promise; return device; });
  await started.promise;
  const logout = f.registry.sync(null, async () => device);
  gate.resolve(); await Promise.all([first, logout]);
  assert.deepEqual(f.calls, []);
});
test('late registration is revoked before the next account can register', async () => {
  const f = fixture(), started = deferred(), gate = deferred();
  f.dependencies.register = async value => { f.calls.push('register:' + value.userId); if (value.userId === userId) { started.resolve(); await gate.promise; } };
  const first = f.registry.sync(identity, async () => device); await started.promise;
  const next = f.registry.sync({ ...identity, userId: otherId }, async () => device);
  gate.resolve(); await Promise.all([first, next]);
  assert.deepEqual(f.calls, ['save', 'register:' + userId, 'unregister:' + userId, 'clear', 'save', 'register:' + otherId]);
  assert.equal(f.saved()?.userId, otherId);
});
test('offline logout retains revocation and blocks new registration until retry succeeds', async () => {
  const f = fixture(registration);
  f.dependencies.unregister = async () => { throw Error('offline'); };
  await assert.rejects(f.registry.sync(null, async () => device));
  await assert.rejects(f.registry.sync({ ...identity, userId: otherId }, async () => device));
  assert.deepEqual(f.saved(), registration); assert.deepEqual(f.calls, []);
  f.dependencies.unregister = async () => { f.calls.push('revoked'); };
  await f.registry.sync({ ...identity, userId: otherId }, async () => device);
  assert.deepEqual(f.calls, ['revoked', 'clear', 'save', 'register:' + otherId]);
});
test('permission revocation and token rotation unregister the former device', async () => {
  const f = fixture(registration);
  assert.equal(await f.registry.sync(identity, async () => null), false);
  assert.equal(f.saved(), null);
  await f.registry.sync(identity, async () => ({ ...device, token: 'ExpoPushToken[changedtoken123456]' }));
  assert.equal(f.saved()?.token, 'ExpoPushToken[changedtoken123456]');
});
test('secure storage failure stops registration; server failure keeps recovery capability', async () => {
  const f = fixture();
  f.dependencies.write = async () => { throw Error('storage unavailable'); };
  await assert.rejects(f.registry.sync(identity, async () => device)); assert.deepEqual(f.calls, []);
  const g = fixture(); g.dependencies.register = async () => { throw Error('ambiguous timeout'); };
  await assert.rejects(g.registry.sync(identity, async () => device)); assert.ok(g.saved()?.secret);
});
test('push taps accept only this project/account and a bounded notification UUID', () => {
  const payload = { kind: 'spottr_notification', userId, projectId, notificationId: otherId };
  assert.equal(pushNotificationID(payload, userId, projectId), otherId);
  for (const value of [null, {}, [], { ...payload, userId: otherId }, { ...payload, projectId: otherId }, { ...payload, notificationId: 'https://evil.test' }, { ...payload, kind: 'url' }]) assert.equal(pushNotificationID(value, userId, projectId), null);
  assert.equal(pushNotificationID(payload, undefined, projectId), null);
});
test('malformed journals never become device registrations', () => {
  assert.deepEqual(parsePushRegistration(JSON.stringify(registration)), registration);
  assert.equal(parsePushRegistration(null), null);
  for (const value of ['null', '{}', 'bad', JSON.stringify({ ...registration, secret: 'short' }), JSON.stringify({ ...registration, token: 'https://evil.test' })]) assert.throws(() => parsePushRegistration(value));
});
test('a lost logout response rotates the revoked capability on a subsequent valid login', async () => {
  const f = fixture(registration); let attempts = 0;
  f.dependencies.register = async value => {
    attempts++;
    if (value.secret === registration.secret) throw { code: 'PUSH_REGISTRATION_REVOKED' };
    assert.equal(f.saved()?.secret, value.secret);
  };
  assert.equal(await f.registry.sync(identity, async () => device), true);
  assert.equal(attempts, 2); assert.notEqual(f.saved()?.secret, registration.secret);
});
