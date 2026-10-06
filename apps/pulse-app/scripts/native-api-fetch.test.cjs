const assert = require('node:assert/strict');
const { test } = require('node:test');
const { modules } = require('./helpers/qaHarness.cjs');

test('native API GET bypasses WebView proxy, preserves auth, JSON and HTTP errors', async () => {
  let options, status = 200;
  const { apiFetch } = modules({
    '@capacitor/core': { CapacitorHttp: { request: async value => {
      options = value;
      return { status, data: status === 200 ? '[{"id":"event"}]' : '{"error":"Unauthorized"}', headers: { 'content-type': 'application/json' } };
    } } },
    './platform': { isNativePlatform: () => true },
  }, { Request, Response, fetch: () => { throw Error('WebView proxy used'); } }).load('lib/native/apiFetch');
  const { ApiClient } = modules({}, { fetch: () => { throw Error('default fetch used'); } }).load('../../../packages/api-client/src/Client.ts');
  ApiClient.configure({ apiRoot: 'https://api.test', fetch: apiFetch, getAccessToken: () => 'token' });
  assert.deepEqual(await ApiClient.instance.get('/events'), [{ id: 'event' }]);
  assert.equal(options.headers.authorization, 'Bearer token');
  assert.equal(options.url, 'https://api.test/events');
  status = 401;
  await assert.rejects(ApiClient.instance.get('/users/me'), error => error.status === 401);
});

test('web, POST and cancellable requests retain fetch transport', async () => {
  let native = false, calls = 0;
  const { apiFetch } = modules({
    '@capacitor/core': { CapacitorHttp: { request: () => { throw Error('native request used'); } } },
    './platform': { isNativePlatform: () => native },
  }, { fetch: async () => { calls++; return new Response('[]'); } }).load('lib/native/apiFetch');
  await apiFetch('https://api.test/events');
  native = true;
  await apiFetch('https://api.test/auth/login', { method: 'POST' });
  await apiFetch('https://api.test/events', { signal: new AbortController().signal });
  assert.equal(calls, 3);
});
