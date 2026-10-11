import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, authorizedFetch, bindSession, createHttp } from '../src/data/http';
import { SessionController, type Account } from '../src/auth/session';

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const user: Account = { id: '12345678-abcd-abcd-abcd-123456789012', username: 'Person', email: 'person@example.test', role: 'user', hasPassword: true, preferredLanguage: 'en', showAttendancePublicly: false, createdAt: '2026-10-07T12:00:00Z' };
function controller() {
  const value = new SessionController({ read: async () => null, write: async () => {} }, { login: async email => ({ token: email }), me: async () => user, update: async (_token, patch) => ({ ...user, ...patch }) });
  bindSession({ token: value.getToken, expire: value.expire });
  return value;
}
const resetBinding = () => bindSession({ token: () => null, expire: () => {} });
beforeEach(resetBinding); afterEach(resetBinding);
const isCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

test('checkout transports the idempotency key without changing the purchase payload', async () => {
  const body = { email: 'buyer@example.test', items: [{ ticketTypeId: 'tier', quantity: 1 }], client: 'native' };
  const http = createHttp('https://example.test/api/v1', async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('Idempotency-Key'), '12345678-abcd-4bcd-8bcd-123456789012');
    assert.deepEqual(JSON.parse(init?.body as string), body);
    return reply({ sessionId: 'cs_test_local' });
  });
  await http('/events/12345678-abcd-abcd-abcd-123456789012/tickets/purchase', { method: 'POST', body, idempotencyKey: '12345678-abcd-4bcd-8bcd-123456789012' });
});

test('JSON requests preserve payloads, method, API base and bearer token', async () => {
  const auth = controller(); await auth.login('current-token', 'password');
  let request: RequestInit | undefined, target = '';
  const http = createHttp('https://example.test/api/v1/', async (url, init) => { target = String(url); request = init; return reply(user); });
  assert.deepEqual(await http('/users/me', { method: 'PUT', body: { bio: '', showAttendancePublicly: false } }), user);
  assert.equal(target, 'https://example.test/api/v1/users/me');
  assert.equal(request?.method, 'PUT');
  assert.deepEqual(JSON.parse(request?.body as string), { bio: '', showAttendancePublicly: false });
  const headers = new Headers(request?.headers);
  assert.equal(headers.get('authorization'), 'Bearer current-token');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('accept'), 'application/json');
});

test('explicit token:null sends an anonymous auth request and does not expire a logged-in account', async () => {
  const auth = controller(); await auth.login('current', 'password');
  const http = createHttp('https://example.test/api/v1', async (_url, init) => { assert.equal(new Headers(init?.headers).has('authorization'), false); return reply({}, 401); });
  await assert.rejects(http('/auth/login', { method: 'POST', token: null, body: { email: 'x', password: 'bad' } }), ApiError);
  assert.equal(auth.getToken(), 'current');
});

test('an explicit temporary token takes precedence over the active session', async () => {
  const auth = controller(); await auth.login('old-session', 'password');
  const http = createHttp('https://example.test/api/v1', async (_url, init) => { assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer candidate'); return reply(user); });
  await http('/users/me', { token: 'candidate', expireSession: false });
  assert.equal(auth.getToken(), 'old-session');
});

test('204 mutation responses do not attempt JSON parsing', async () => {
  const http = createHttp('https://example.test/api/v1', async () => new Response(null, { status: 204 }));
  assert.equal(await http('/users/me', { method: 'DELETE', body: { confirmation: user.email, currentPassword: 'password' } }), undefined);
});

test('avatar uploads send raw bytes with their image content type, not JSON or multipart', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const http = createHttp('https://example.test/api/v1', async (_url, init) => {
    assert.equal(init?.body, bytes);
    assert.equal(new Headers(init?.headers).get('content-type'), 'image/jpeg');
    assert.equal(init?.method, 'POST');
    return reply(user);
  });
  assert.deepEqual(await http('/users/me/avatar', { method: 'POST', binary: bytes, contentType: 'image/jpeg' }), user);
});

test('server error status and error code survive JSON and plain-text failures', async () => {
  for (const [response, code] of [[reply({ code: 'RATE_LIMITED', error: 'Try later' }, 429), 'RATE_LIMITED'], [reply({ error: 'CUI already exists' }, 409), 'CUI already exists'], [new Response('unavailable', { status: 503 }), 'HTTP_ERROR']] as const) {
    const http = createHttp('https://example.test/api/v1', async () => response);
    await assert.rejects(http('/users/me'), (error: unknown) => error instanceof ApiError && error.status === response.status && error.code === code);
  }
  await assert.rejects(createHttp('https://example.test/api/v1', async () => new Response('{'))('/users/me'), isCode('INVALID_RESPONSE'));
});

test('invalid request targets are rejected before sending a token or network request', async () => {
  let calls = 0;
  const http = createHttp('https://example.test/api/v1', async () => { calls++; return reply({}); });
  for (const path of ['users/me', '//other.example/users/me', 'https://other.example/users/me']) await assert.rejects(http(path), isCode('INVALID_PATH'));
  assert.equal(calls, 0);
});

test('401 from the current session expires it, while 403 does not', async () => {
  const auth = controller(); await auth.login('current', 'password');
  await assert.rejects(createHttp('https://example.test/api/v1', async () => reply({}, 403))('/dashboard/profile'), ApiError);
  assert.equal(auth.getToken(), 'current');
  await assert.rejects(createHttp('https://example.test/api/v1', async () => reply({}, 401))('/users/me'), ApiError);
  assert.equal(auth.getToken(), null);
  assert.equal(auth.getSnapshot().user, null);
});

test('a delayed 401 from account A cannot expire account B', async () => {
  const auth = controller(); await auth.login('account-a', 'password');
  const response = deferred<Response>();
  const http = createHttp('https://example.test/api/v1', async (_url, init) => { assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer account-a'); return response.promise; });
  const request = http('/users/me');
  const rejected = assert.rejects(request, ApiError);
  await auth.login('account-b', 'password'); response.resolve(reply({}, 401)); await rejected;
  assert.equal(auth.getToken(), 'account-b');
  assert.equal(auth.getSnapshot().user?.id, user.id);
});

test('bad login/reset/delete passwords and explicitly suppressed 401s retain the session', async () => {
  const auth = controller(); await auth.login('current', 'password');
  const http = createHttp('https://example.test/api/v1', async () => reply({ error: 'incorrect credentials' }, 401));
  for (const path of ['/auth/login', '/auth/reset-password']) {
    await assert.rejects(http(path, { method: 'POST', body: { password: 'incorrect' } }), ApiError);
    assert.equal(auth.getToken(), 'current');
  }
  await assert.rejects(http('/users/me', { method: 'DELETE', body: { confirmation: user.email, currentPassword: 'incorrect' } }), ApiError);
  assert.equal(auth.getToken(), 'current');
  await assert.rejects(http('/users/me', { expireSession: false }), ApiError);
  assert.equal(auth.getToken(), 'current');
});

function abortingFetch(): typeof fetch {
  return async (_input, init) => new Promise<Response>((_resolve, reject) => {
    const abort = () => reject(new DOMException('The request was aborted', 'AbortError'));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener('abort', abort, { once: true });
  });
}

test('timeouts abort the request and expose TIMEOUT', async () => {
  let signal: AbortSignal | null | undefined;
  const inner = abortingFetch();
  const http = createHttp('https://example.test/api/v1', async (url, init) => { signal = init?.signal; return inner(url, init); }, 10);
  await assert.rejects(http('/users/me'), isCode('TIMEOUT'));
  assert.equal(signal?.aborted, true);
});

test('pre-aborted and subsequently cancelled requests retain AbortError', async () => {
  for (const preAborted of [true, false]) {
    const abort = new AbortController();
    if (preAborted) abort.abort();
    const http = createHttp('https://example.test/api/v1', abortingFetch());
    const pending = http('/users/me', { signal: abort.signal });
    if (!preAborted) abort.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  }
});

test('cancellation while reading a successful response body remains AbortError', async () => {
  const opened = deferred<void>();
  const http = createHttp('https://example.test/api/v1', async (_url, init) => {
    const stream = new ReadableStream({ start(body) { init?.signal?.addEventListener('abort', () => body.error(new DOMException('Aborted while reading', 'AbortError')), { once: true }); } });
    opened.resolve();
    return new Response(stream, { headers: { 'content-type': 'application/json' } });
  });
  const abort = new AbortController();
  const pending = http('/users/me', { signal: abort.signal });
  await opened.promise; abort.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('timeouts include stalled response-body reads', async () => {
  const http = createHttp('https://example.test/api/v1', async (_url, init) => new Response(new ReadableStream({ start(body) { init?.signal?.addEventListener('abort', () => body.error(new DOMException('Aborted', 'AbortError')), { once: true }); } })), 10);
  await assert.rejects(http('/users/me'), isCode('TIMEOUT'));
});

test('authorized public reads forward the viewer token and preserve supplied headers', async context => {
  const auth = controller(); await auth.login('viewer', 'password');
  context.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer viewer');
    assert.equal(headers.get('accept'), 'application/json');
    return reply([]);
  });
  await authorizedFetch('https://example.test/api/v1/events', { headers: { Accept: 'application/json' } });
});

test('authorized public reads also ignore stale 401s after account changes', async context => {
  const auth = controller(); await auth.login('old-viewer', 'password');
  const response = deferred<Response>();
  context.mock.method(globalThis, 'fetch', async () => response.promise);
  const request = authorizedFetch('https://example.test/api/v1/events');
  await auth.login('new-viewer', 'password');
  response.resolve(reply({}, 401)); await request;
  assert.equal(auth.getToken(), 'new-viewer');
});
