import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionController, parseAccount, validPassword, type Account, type SessionApi, type SessionStorage } from '../src/auth/session';
import { ApiError } from '../src/data/http';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const id = (n = 1) => `12345678-abcd-abcd-abcd-${String(n).padStart(12, '0')}`;
const account = (n = 1): Account => ({ id: id(n), username: `Person ${n}`, email: `person${n}@example.test`, role: 'user', hasPassword: true, preferredLanguage: 'en', showAttendancePublicly: false, createdAt: '2026-10-07T12:00:00Z' });
const stored = (token = 'token-a', user = account()) => JSON.stringify({ token, user });
function memory(initial: string | null = null) {
  let value = initial;
  const writes: Array<string | null> = [];
  const storage: SessionStorage = { read: async () => value, write: async next => { writes.push(next); value = next; } };
  return { storage, writes, value: () => value };
}
function api(overrides: Partial<SessionApi> = {}): SessionApi {
  return { login: async () => ({ token: 'token-a' }), me: async () => account(), update: async (_token, patch) => ({ ...account(), ...patch }), ...overrides };
}
const invalidResponse = (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE';

test('account validation rejects missing identity, role and password information', () => {
  for (const value of [null, [], {}, { ...account(), id: '' }, { ...account(), role: 'owner' }, { ...account(), hasPassword: undefined }]) {
    assert.throws(() => parseAccount(value), invalidResponse);
  }
  assert.equal(parseAccount(account()).showAttendancePublicly, false);
});

test('password boundaries use UTF-8 bytes, including emoji', () => {
  assert.equal(validPassword('a'.repeat(7)), false);
  assert.equal(validPassword('a'.repeat(8)), true);
  assert.equal(validPassword('a'.repeat(72)), true);
  assert.equal(validPassword('a'.repeat(73)), false);
  assert.equal(validPassword('\u{1f389}'.repeat(18)), true);
  assert.equal(validPassword('\u{1f389}'.repeat(19)), false);
});

test('empty and corrupt persisted sessions settle ready without publishing a user', async () => {
  for (const value of [null, '{broken', 'null', '[]', JSON.stringify({ token: 'token-a', user: {} })]) {
    const disk = memory(value);
    let reads = 0;
    const controller = new SessionController(disk.storage, api({ me: async () => { reads++; return account(); } }));
    await controller.hydrate();
    assert.equal(controller.getSnapshot().ready, true);
    assert.equal(controller.getSnapshot().user, null);
    assert.equal(controller.getToken(), null);
    assert.equal(reads, 0);
    if (value !== null) assert.equal(disk.value(), null);
  }
});

test('a storage read failure is observable and does not leave startup loading forever', async () => {
  const controller = new SessionController({ read: async () => { throw new Error('keychain unavailable'); }, write: async () => {} }, api());
  await controller.hydrate();
  assert.equal(controller.getSnapshot().ready, true);
  assert.equal(controller.getSnapshot().storageError, true);
  assert.equal(controller.getToken(), null);
});

test('logout wins over a delayed persisted-session read', async () => {
  const read = deferred<string | null>();
  const writes: Array<string | null> = [];
  let requests = 0;
  const controller = new SessionController({ read: () => read.promise, write: async value => { writes.push(value); } }, api({ me: async () => { requests++; return account(); } }));
  const hydration = controller.hydrate();
  await controller.logout();
  read.resolve(stored()); await hydration;
  assert.equal(controller.getToken(), null);
  assert.equal(controller.getSnapshot().user, null);
  assert.equal(requests, 0);
  assert.deepEqual(writes, [null]);
});

test('logout wins over a delayed hydration API response', async () => {
  const response = deferred<unknown>();
  const disk = memory(stored());
  const controller = new SessionController(disk.storage, api({ me: () => response.promise }));
  const hydration = controller.hydrate(); await flush();
  await controller.logout();
  response.resolve(account()); await hydration;
  assert.equal(controller.getToken(), null);
  assert.equal(controller.getSnapshot().user, null);
  assert.equal(disk.value(), null);
});

test('transient network, timeout, throttling and server errors restore the cached account offline', async () => {
  for (const error of [new TypeError('Network request failed'), new ApiError(0, 'TIMEOUT'), new ApiError(429, 'HTTP_ERROR'), new ApiError(500, 'HTTP_ERROR'), new ApiError(503, 'HTTP_ERROR')]) {
    const disk = memory(stored());
    const controller = new SessionController(disk.storage, api({ me: async () => { throw error; } }));
    await controller.hydrate();
    assert.equal(controller.getSnapshot().user?.id, id());
    assert.equal(controller.getSnapshot().offline, true);
    assert.equal(controller.getSnapshot().ready, true);
    assert.equal(controller.getToken(), 'token-a');
    assert.equal(disk.value(), stored());
  }
});

test('confirmed invalid sessions are cleared instead of restored offline', async () => {
  for (const status of [401, 403, 404]) {
    const disk = memory(stored());
    const controller = new SessionController(disk.storage, api({ me: async () => { throw new ApiError(status, 'HTTP_ERROR'); } }));
    await controller.hydrate();
    assert.equal(controller.getSnapshot().user, null);
    assert.equal(controller.getSnapshot().offline, false);
    assert.equal(controller.getSnapshot().ready, true);
    assert.equal(controller.getToken(), null);
    assert.equal(disk.value(), null);
  }
});

test('malformed and non-transient responses cannot masquerade as an authenticated offline session', async () => {
  for (const error of [new ApiError(400, 'HTTP_ERROR'), new ApiError(422, 'HTTP_ERROR'), new ApiError(0, 'INVALID_RESPONSE')]) {
    const controller = new SessionController(memory(stored()).storage, api({ me: async () => { throw error; } }));
    await controller.hydrate();
    assert.equal(controller.getSnapshot().offline, false, error.code);
    assert.equal(controller.getSnapshot().user, null, error.code);
    assert.equal(controller.getSnapshot().ready, true);
    assert.equal(controller.getSnapshot().error, true);
  }
});

test('a malformed successful account response does not restore stale cached identity', async () => {
  for (const response of [null, [], { unexpected: true }, { ...account(), hasPassword: 'false' }]) {
    const controller = new SessionController(memory(stored()).storage, api({ me: async () => response }));
    await controller.hydrate();
    assert.equal(controller.getSnapshot().user, null);
    assert.equal(controller.getSnapshot().offline, false);
    assert.equal(controller.getSnapshot().error, true);
  }
});

test('hydrating a stored identity invalidates guest data once, including offline restoration', async () => {
  for (const offline of [false, true]) {
    let changes = 0;
    const controller = new SessionController(memory(stored()).storage, api({ me: async () => { if (offline) throw new TypeError('offline'); return account(); } }), () => { changes++; });
    await controller.hydrate(); await controller.hydrate();
    assert.equal(changes, 1);
  }
});

test('overlapping hydration calls share startup work', async () => {
  const response = deferred<unknown>();
  let requests = 0;
  const controller = new SessionController(memory(stored()).storage, api({ me: () => { requests++; return response.promise; } }));
  const first = controller.hydrate(), second = controller.hydrate();
  await flush(); response.resolve(account());
  await Promise.all([first, second]);
  assert.equal(requests, 1, 'Strict Mode or overlapping mounts must not start competing session restores');
});

test('login trims only email and persists the server-validated account', async () => {
  const disk = memory();
  let changes = 0;
  const controller = new SessionController(disk.storage, api({ login: async (email, password) => { assert.equal(email, 'person1@example.test'); assert.equal(password, ' password '); return { token: 'verified-token' }; }, me: async token => { assert.equal(token, 'verified-token'); return account(); } }), () => { changes++; });
  assert.equal(await controller.login('  person1@example.test  ', ' password '), true);
  assert.equal(controller.getToken(), 'verified-token');
  assert.equal(controller.getSnapshot().busy, false);
  assert.equal(controller.getSnapshot().ready, true);
  assert.deepEqual(JSON.parse(disk.value()!), { token: 'verified-token', user: account() });
  assert.equal(changes, 1);
});

test('login errors release busy state and never save unvalidated tokens', async () => {
  for (const failure of ['credentials', 'identity']) {
    const disk = memory();
    const controller = new SessionController(disk.storage, api({ login: async () => { if (failure === 'credentials') throw new ApiError(401, 'INVALID_CREDENTIALS'); return { token: 'unverified' }; }, me: async () => { throw new ApiError(503, 'HTTP_ERROR'); } }));
    await assert.rejects(controller.login('email', 'password'), ApiError);
    assert.equal(controller.getSnapshot().busy, false);
    assert.equal(controller.getSnapshot().user, null);
    assert.equal(controller.getToken(), null);
    assert.deepEqual(disk.writes, []);
  }
});

test('logout cancels a pending login response and a pending identity validation', async () => {
  for (const stage of ['login', 'identity']) {
    const response = deferred<unknown>();
    const disk = memory();
    const controller = new SessionController(disk.storage, api(stage === 'login' ? { login: () => response.promise as Promise<{ token: string }> } : { me: () => response.promise }));
    const login = controller.login('email', 'password'); await flush();
    await controller.logout();
    response.resolve(stage === 'login' ? { token: 'stale' } : account());
    assert.equal(await login, false);
    assert.equal(controller.getToken(), null);
    assert.equal(controller.getSnapshot().user, null);
    assert.equal(disk.value(), null);
  }
});

test('a newer successful login cannot be replaced by an older login response', async () => {
  const old = deferred<{ token: string }>();
  const disk = memory();
  const controller = new SessionController(disk.storage, api({ login: email => email === 'old' ? old.promise : Promise.resolve({ token: 'new' }), me: async () => account(2) }));
  const first = controller.login('old', 'password');
  assert.equal(await controller.login('new', 'password'), true);
  old.resolve({ token: 'old' }); assert.equal(await first, false);
  assert.equal(controller.getToken(), 'new');
  assert.equal(controller.getSnapshot().user?.id, id(2));
  assert.equal(JSON.parse(disk.value()!).token, 'new');
});

test('login, logout and a second login preserve durable write order', async () => {
  const firstWrite = deferred<void>(), started = deferred<void>();
  const writes: Array<string | null> = [];
  let disk: string | null = null;
  const storage: SessionStorage = { read: async () => disk, write: async value => { writes.push(value); if (writes.length === 1) { started.resolve(); await firstWrite.promise; } disk = value; } };
  const controller = new SessionController(storage, api({ login: async email => ({ token: email }), me: async token => account(token === 'a' ? 1 : 2) }));
  const a = controller.login('a', 'password'); await started.promise;
  const logout = controller.logout();
  assert.equal(controller.getToken(), null);
  const b = controller.login('b', 'password'); await flush();
  assert.equal(writes.length, 1);
  firstWrite.resolve(); await Promise.all([a, logout, b]);
  assert.deepEqual(writes.map(value => value && JSON.parse(value).token), ['a', null, 'b']);
  assert.equal(JSON.parse(disk!).token, 'b');
  assert.equal(controller.getSnapshot().user?.id, id(2));
});

test('write failures are visible and do not poison subsequent logout or login writes', async () => {
  let fail = true;
  const disk = memory();
  const controller = new SessionController({ read: disk.storage.read, write: async value => { if (fail) { fail = false; throw new Error('keychain unavailable'); } await disk.storage.write(value); } }, api());
  await controller.login('email', 'password');
  assert.equal(controller.getSnapshot().storageError, true);
  await controller.logout();
  assert.equal(controller.getSnapshot().storageError, false);
  assert.equal(disk.value(), null);
  await controller.login('email', 'password');
  assert.equal(JSON.parse(disk.value()!).token, 'token-a');
});

test('an old account write failure cannot mark a newer persisted session as broken', async () => {
  const blocked = deferred<void>(), started = deferred<void>();
  let writes = 0;
  const disk = memory();
  const controller = new SessionController({ read: disk.storage.read, write: async value => {
    if (++writes === 1) { started.resolve(); await blocked.promise; }
    await disk.storage.write(value);
  } }, api({ login: async email => ({ token: email }) }));
  const older = controller.login('old', 'password'); await started.promise;
  const newer = controller.login('new', 'password'); await flush();
  blocked.reject(new Error('old keychain write failed'));
  assert.equal(await older, false); assert.equal(await newer, true);
  assert.equal(controller.getSnapshot().storageError, false);
  assert.equal(JSON.parse(disk.value()!).token, 'new');
});

test('serialized successful profile edits preserve both language and privacy changes', async () => {
  const blocked = deferred<void>();
  let server = account(), calls = 0;
  const controller = new SessionController(memory().storage, api({ update: async (_token, patch) => {
    if (++calls === 1) await blocked.promise;
    server = { ...server, ...patch };
    return server;
  } }));
  await controller.login('email', 'password');
  const language = controller.update({ preferredLanguage: 'ro' });
  const privacy = controller.update({ showAttendancePublicly: true }); await flush();
  assert.equal(calls, 1); blocked.resolve();
  await Promise.all([language, privacy]);
  assert.equal(controller.getSnapshot().user?.preferredLanguage, 'ro');
  assert.equal(controller.getSnapshot().user?.showAttendancePublicly, true);
});

test('profile updates serialize full-account responses and recover after a failed mutation', async () => {
  const first = deferred<unknown>();
  const calls: string[] = [];
  const controller = new SessionController(memory().storage, api({ update: async (_token, patch) => { calls.push(patch.username!); if (calls.length === 1) return first.promise; return { ...account(), ...patch }; } }));
  await controller.login('email', 'password');
  const failed = controller.update({ username: 'first' });
  const failedAssertion = assert.rejects(failed, /offline/);
  const second = controller.update({ username: 'second' }); await flush();
  assert.deepEqual(calls, ['first']);
  first.reject(new Error('offline')); await failedAssertion; await second;
  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(controller.getSnapshot().user?.username, 'second');
});

test('logout discards an in-flight profile response and queued profile mutations', async () => {
  const response = deferred<unknown>();
  const disk = memory();
  let requests = 0;
  const controller = new SessionController(disk.storage, api({ update: () => { requests++; return response.promise; } }));
  await controller.login('email', 'password');
  const first = controller.update({ username: 'old' });
  const second = controller.update({ bio: 'queued' }); await flush();
  await controller.logout(); response.resolve({ ...account(), username: 'old' });
  assert.equal(await first, null); assert.equal(await second, null);
  assert.equal(requests, 1);
  assert.equal(controller.getSnapshot().user, null);
  assert.equal(disk.value(), null);
});

test('logout during profile persistence prevents returning a stale account to the caller', async () => {
  const blocked = deferred<void>(), started = deferred<void>();
  let writes = 0;
  const controller = new SessionController({ read: async () => null, write: async () => { if (++writes === 2) { started.resolve(); await blocked.promise; } } }, api());
  await controller.login('email', 'password');
  const update = controller.update({ preferredLanguage: 'ro' }); await started.promise;
  const logout = controller.logout(); blocked.resolve();
  assert.equal(await update, null, 'UI callers must not apply stale language/profile changes after logout');
  await logout;
  assert.equal(controller.getSnapshot().user, null);
});

test('an old profile response cannot change the next account or its persisted session', async () => {
  const response = deferred<unknown>();
  const disk = memory();
  const controller = new SessionController(disk.storage, api({ login: async email => ({ token: email }), me: async token => account(token === 'a' ? 1 : 2), update: () => response.promise }));
  await controller.login('a', 'password');
  const oldUpdate = controller.update({ username: 'Stale username' }); await flush();
  await controller.login('b', 'password');
  response.resolve({ ...account(), username: 'Stale username' });
  assert.equal(await oldUpdate, null);
  assert.equal(controller.getToken(), 'b');
  assert.equal(controller.getSnapshot().user?.id, id(2));
  assert.equal(JSON.parse(disk.value()!).user.id, id(2));
});

test('a profile response for another account cannot replace the current identity', async () => {
  const disk = memory();
  const controller = new SessionController(disk.storage, api({ update: async () => account(2) }));
  await controller.login('email', 'password');
  await assert.rejects(controller.update({ bio: 'edit' }), invalidResponse);
  assert.equal(controller.getSnapshot().user?.id, id());
  assert.equal(JSON.parse(disk.value()!).user.id, id());
});

test('expiry from an older token does not sign out the new account', async () => {
  const controller = new SessionController(memory().storage, api({ login: async email => ({ token: email }) }));
  await controller.login('old', 'password'); await controller.login('new', 'password');
  controller.expire('old'); await flush();
  assert.equal(controller.getToken(), 'new');
  controller.expire('new'); await flush();
  assert.equal(controller.getToken(), null);
  assert.equal(controller.getSnapshot().user, null);
});

test('refresh without a session does not call the authenticated API', async () => {
  let requests = 0;
  const controller = new SessionController(memory().storage, api({ me: async () => { requests++; return account(); } }));
  assert.equal(await controller.refresh(), null);
  assert.equal(requests, 0);
});

test('refresh persists new account data and recovers from offline hydration', async () => {
  const disk = memory(stored()); let offline = true;
  const updated = { ...account(), avatarUrl: 'https://images.example.test/new.webp' };
  const controller = new SessionController(disk.storage, api({ me: async () => { if (offline) throw new TypeError('offline'); return updated; } }));
  await controller.hydrate(); assert.equal(controller.getSnapshot().offline, true);
  offline = false;
  assert.deepEqual(await controller.refresh(), updated);
  assert.equal(controller.getSnapshot().offline, false);
  assert.deepEqual(JSON.parse(disk.value()!).user, updated);
});

test('malformed or mismatched refresh responses preserve the current account and storage', async () => {
  for (const response of [null, {}, account(2)]) {
    const disk = memory(); let calls = 0;
    const controller = new SessionController(disk.storage, api({ me: async () => ++calls === 1 ? account() : response }));
    await controller.login('email', 'password');
    await assert.rejects(controller.refresh(), invalidResponse);
    assert.deepEqual(controller.getSnapshot().user, account());
    assert.deepEqual(JSON.parse(disk.value()!).user, account());
  }
});

test('a delayed refresh cannot revive a logged out account', async () => {
  const response = deferred<unknown>(), disk = memory(); let calls = 0;
  const controller = new SessionController(disk.storage, api({ me: () => ++calls === 1 ? Promise.resolve(account()) : response.promise }));
  await controller.login('email', 'password');
  const refresh = controller.refresh(); await flush();
  await controller.logout(); response.resolve(account());
  assert.equal(await refresh, null);
  assert.equal(controller.getToken(), null); assert.equal(disk.value(), null);
});

test('a delayed refresh cannot overwrite a different logged in account', async () => {
  const response = deferred<unknown>(), disk = memory(); let calls = 0;
  const controller = new SessionController(disk.storage, api({ login: async email => ({ token: email }), me: token => token === 'b' ? Promise.resolve(account(2)) : ++calls === 1 ? Promise.resolve(account()) : response.promise }));
  await controller.login('a', 'password');
  const refresh = controller.refresh(); await flush();
  await controller.login('b', 'password'); response.resolve(account());
  assert.equal(await refresh, null);
  assert.equal(controller.getToken(), 'b');
  assert.deepEqual(controller.getSnapshot().user, account(2));
  assert.deepEqual(JSON.parse(disk.value()!).user, account(2));
});

test('logout during refresh persistence does not return a stale account to callers', async () => {
  const blocked = deferred<void>(), started = deferred<void>(); let writes = 0;
  const controller = new SessionController({ read: async () => null, write: async () => { if (++writes === 2) { started.resolve(); await blocked.promise; } } }, api());
  await controller.login('email', 'password');
  const refresh = controller.refresh(); await started.promise;
  const logout = controller.logout(); blocked.resolve();
  assert.equal(await refresh, null); await logout;
  assert.equal(controller.getSnapshot().user, null);
});

test('a refresh started before a profile update cannot persist over the newer edit', async () => {
  const response = deferred<unknown>(), disk = memory(); let reads = 0;
  const updated = { ...account(), username: 'Latest name', preferredLanguage: 'ro' as const };
  const controller = new SessionController(disk.storage, api({ me: () => ++reads === 1 ? Promise.resolve(account()) : response.promise, update: async () => updated }));
  await controller.login('email', 'password');
  const refresh = controller.refresh(); await flush();
  const update = controller.update({ username: updated.username, preferredLanguage: 'ro' }); await flush();
  response.resolve(account()); await Promise.all([refresh, update]);
  assert.deepEqual(controller.getSnapshot().user, updated);
  assert.deepEqual(JSON.parse(disk.value()!).user, updated);
});

test('concurrent refreshes cannot apply an older server snapshot last', async () => {
  const old = deferred<unknown>(), disk = memory(); let reads = 0;
  const latest = { ...account(), avatarUrl: 'https://images.example.test/latest.webp' };
  const controller = new SessionController(disk.storage, api({ me: () => ++reads === 1 ? Promise.resolve(account()) : reads === 2 ? old.promise : Promise.resolve(latest) }));
  await controller.login('email', 'password');
  const first = controller.refresh(); await flush();
  const second = controller.refresh(); await flush();
  old.resolve(account()); await Promise.all([first, second]);
  assert.deepEqual(controller.getSnapshot().user, latest);
  assert.deepEqual(JSON.parse(disk.value()!).user, latest);
});

test('refresh storage errors remain observable without dropping the valid online account', async () => {
  let writes = 0;
  const controller = new SessionController({ read: async () => null, write: async () => { if (++writes === 2) throw new Error('disk full'); } }, api());
  await controller.login('email', 'password'); await controller.refresh();
  assert.deepEqual(controller.getSnapshot().user, account());
  assert.equal(controller.getSnapshot().storageError, true);
  await controller.refresh(); assert.equal(controller.getSnapshot().storageError, false);
});

test('confirmed invalid identity responses during refresh clear the current durable session', async () => {
  for (const status of [401, 403, 404]) {
    const disk = memory(); let reads = 0;
    const failure = new ApiError(status, 'IDENTITY_REJECTED');
    const controller = new SessionController(disk.storage, api({ me: async () => { if (++reads > 1) throw failure; return account(); } }));
    await controller.login('email', 'password');
    await assert.rejects(controller.refresh(), error => error === failure);
    assert.equal(controller.getSnapshot().user, null, `identity response ${status} must clear the cached user`);
    assert.equal(controller.getToken(), null);
    assert.equal(disk.value(), null);
  }
});

test('transient refresh failures retain identity and storage and allow the next refresh to recover', async () => {
  for (const failure of [new TypeError('offline'), new ApiError(0, 'TIMEOUT'), new ApiError(429, 'RATE_LIMITED'), new ApiError(500, 'SERVER_ERROR'), new ApiError(503, 'UNAVAILABLE')]) {
    const disk = memory(); let reads = 0;
    const updated = { ...account(), bio: 'Fresh after retry' };
    const controller = new SessionController(disk.storage, api({ me: async () => { if (++reads === 2) throw failure; return reads === 1 ? account() : updated; } }));
    await controller.login('email', 'password');
    const before = disk.value();
    await assert.rejects(controller.refresh(), error => error === failure);
    assert.equal(controller.getToken(), 'token-a');
    assert.deepEqual(controller.getSnapshot().user, account());
    assert.equal(disk.value(), before);
    assert.deepEqual(await controller.refresh(), updated);
    assert.equal(controller.getSnapshot().offline, false);
    assert.deepEqual(JSON.parse(disk.value()!).user, updated);
  }
});

test('an invalid-session response from an old refresh cannot expire the new account', async () => {
  const response = deferred<unknown>(), disk = memory(); let reads = 0;
  const controller = new SessionController(disk.storage, api({ login: async email => ({ token: email }), me: token => token === 'b' ? Promise.resolve(account(2)) : ++reads === 1 ? Promise.resolve(account()) : response.promise }));
  await controller.login('a', 'password');
  const refresh = controller.refresh();
  const settled = refresh.then(() => {}, () => {});
  await flush(); await controller.login('b', 'password');
  response.reject(new ApiError(401, 'EXPIRED_OLD_TOKEN')); await settled;
  assert.equal(controller.getToken(), 'b');
  assert.deepEqual(controller.getSnapshot().user, account(2));
  assert.deepEqual(JSON.parse(disk.value()!).user, account(2));
});
