import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
const { createApiProxy } = createRequire(import.meta.url)('../scripts/api-proxy.cjs');

async function listen(server: http.Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function close(server: http.Server) {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

test('story preview proxy returns public image bytes and blocks writes, foreign origins and non-image media paths', async () => {
  const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46]), received: string[] = [];
  const upstream = http.createServer((req, res) => { received.push(req.url!); assert.equal(req.headers.accept, 'image/*'); res.writeHead(200, { 'Content-Type': 'image/webp' }); res.end(bytes); });
  const api = await listen(upstream), proxy = createApiProxy(api + '/api/v1');
  const server = http.createServer((req, res) => proxy(req, res, () => res.end())), base = await listen(server);
  const asset = '/api/v1/media/events/00000000-0000-4000-8000-000000000001/abc123.webp';
  try {
    const response = await request(base, asset);
    assert.equal(response.status, 200); assert.equal(response.headers['content-type'], 'image/webp'); assert.equal(response.body, bytes.toString());
    assert.equal((await request(base, asset, {}, 'POST')).status, 405);
    assert.equal((await request(base, asset, { origin: 'https://other.example.test' })).status, 403);
    assert.equal((await request(base, asset.replace('.webp', '.html'))).status, 403);
    assert.equal((await request(base, '/api/v1/media/private/secret')).status, 403);
    assert.deepEqual(received, [asset]);
  } finally { await close(server); await close(upstream); }
});

test('wardrobe and shared scan history reach the API with exact paths, methods and credentials', async () => {
  const received: { path: string; method: string; body: string; auth?: string }[] = [];
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      received.push({ path: req.url!, method: req.method!, body, auth: req.headers.authorization });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"deposits":[],"staffAccess":false}');
    });
  });
  const api = await listen(upstream), proxy = createApiProxy(api + '/api/v1');
  const server = http.createServer((req, res) => proxy(req, res, () => res.end())), base = await listen(server);
  const id = '12345678-abcd-4bcd-8bcd-123456789012';
  const headers = { origin: base, authorization: 'Bearer wardrobe-qa-only', 'content-type': 'application/json' };
  const routes = [
    ['GET', '/wardrobe/mine'], ['GET', '/wardrobe/events'],
    ['GET', `/wardrobe/events/${id}?unclaimed=true&q=A001`],
    ['GET', `/wardrobe/events/${id}/deposits/${id}`],
    ['POST', `/wardrobe/events/${id}/commands`], ['POST', `/wardrobe/mine/${id}/confirm`],
    ['GET', `/dashboard/ticket-validation/events/${id}/scans?scope=all&limit=20`],
  ];
  try {
    for (const [method, path] of routes) {
      const body = method === 'POST' ? '{"action":"lookup"}' : undefined;
      const result = await request(base, '/api/v1' + path, headers, method, body);
      assert.equal(result.status, 200, `${method} ${path}`);
      assert.deepEqual(received.at(-1), { path: '/api/v1' + path, method, body: body || '', auth: headers.authorization });
    }
    assert.equal((await request(base, `/api/v1/wardrobe/events/${id}/commands`, headers)).status, 405);
    assert.equal((await request(base, '/api/v1/wardrobe/mine', headers, 'DELETE')).status, 405);
    assert.equal((await request(base, '/api/v1/wardrobe/private', headers)).status, 403);
    assert.equal((await request(base, '/api/v1/wardrobe/events/not-an-id', headers)).status, 403);
    assert.equal((await request(base, '/api/v1/wardrobe/mine', { ...headers, origin: 'https://external.test' })).status, 403);
    assert.equal(received.length, routes.length, 'Rejected requests never reach the API');
  } finally { await close(server); await close(upstream); }
});

test('new native flows retain exact method, auth and upload limits through the preview proxy', async () => {
  const received: string[] = [];
  const upstream = http.createServer((req, res) => { received.push(req.method + ' ' + req.url); assert.equal(req.headers.authorization, 'Bearer local-test'); req.resume(); req.on('end', () => { res.writeHead(204); res.end(); }); });
  const api = await listen(upstream), proxy = createApiProxy(api + '/api/v1');
  const server = http.createServer((req, res) => proxy(req, res, () => res.end())), base = await listen(server);
  const id = '12345678-abcd-abcd-abcd-123456789012';
  try {
    const cases = [
      ['GET', '/admin/commissions'], ['PUT', '/admin/commissions/standard'], ['PUT', `/admin/organizers/${id}/commission`],
      ['POST', `/events/${id}/safety-group/help`], ['GET', `/events/${id}/attendees`],
      ['POST', `/dashboard/ticket-validation/events/${id}/offline-sync`], ['GET', '/dashboard/ticket-validation/events'],
      ['DELETE', `/dashboard/ticket-validation/events/${id}/staff/${id}`], ['POST', '/ticket-validation/quick-access/validate'],
      ['POST', `/dashboard/events/${id}`], ['GET', '/dashboard/finance'], ['PUT', '/dashboard/invoicing/settings'],
      ['POST', '/dashboard/invoicing/service/activate'],
      ['POST', '/dashboard/promotions/checkout'], ['PATCH', `/admin/organizers/${id}/verification`],
      ['GET', '/dashboard/finance/refunds-attention'], ['GET', '/dashboard/finance/invoices'],
      ['POST', `/dashboard/finance/refunds-attention/${id}/reconcile`], ['POST', `/dashboard/promotions/${id}/reconcile`],
      ['GET', '/spotify/search?q=artist'], ['GET', '/dashboard/places/autocomplete?q=Club&session=test-session-token'],
      ['GET', '/dashboard/places/details?placeId=ChIJ_venue&session=test-session-token'],
    ];
    for (const [method, path] of cases) assert.equal((await request(base, '/api/v1' + path, { authorization: 'Bearer local-test' }, method)).status, 204, method + ' ' + path);
    assert.equal(received.length, cases.length);
    assert.equal((await request(base, `/api/v1/events/${id}/safety-group/help`, {}, 'GET')).status, 405);
    assert.equal((await request(base, `/api/v1/admin/organizers/${id}/verification`, {}, 'DELETE')).status, 405);
    assert.equal((await request(base, '/api/v1/admin/anything-else')).status, 403);
    assert.equal((await request(base, '/api/v1/dashboard/places/details', {}, 'POST')).status, 405);
    assert.equal((await request(base, '/api/v1/dashboard/invoicing/service/activate', {}, 'GET')).status, 405);
    assert.equal((await request(base, '/api/v1/dashboard/places/anything-else')).status, 403);
    assert.equal((await request(base, '/api/v1/dashboard/uploads/event-banner', { authorization: 'Bearer local-test', 'content-type': 'image/webp' }, 'POST', Buffer.alloc(65537))).status, 204);
    assert.equal((await request(base, '/api/v1/dashboard/uploads/event-banner', { 'content-length': '2097153' }, 'POST')).status, 413);
  } finally { await close(server); await close(upstream); }
});
function request(base: string, path: string, headers: Record<string, string> = {}, method = 'GET', data?: string | Buffer) {
  return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const req = http.request(base, { path, headers, method }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode!, body, headers: res.headers }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Proxy test request timed out')));
    req.on('error', reject); req.end(data);
  });
}

test('diagnostic preview forwards anonymous reports and restricts admin reads to GET', async () => {
  const received: { path?: string; auth?: string; body: string }[] = [];
  const upstream = http.createServer((req, res) => {
    let body = ''; req.on('data', chunk => { body += chunk; });
    req.on('end', () => { received.push({ path: req.url, auth: req.headers.authorization, body }); res.writeHead(204); res.end(); });
  });
  const api = await listen(upstream), proxy = createApiProxy(api + '/api/v1');
  const server = http.createServer((req, res) => proxy(req, res, () => res.end())), base = await listen(server);
  try {
    assert.equal((await request(base, '/api/v1/diagnostics/errors', { 'content-type': 'application/json' }, 'POST', '{"platform":"ios"}')).status, 204);
    assert.equal(received[0]!.auth, undefined);
    assert.equal(received[0]!.body, '{"platform":"ios"}');
    assert.equal((await request(base, '/api/v1/admin/client-errors?platform=ios', { authorization: 'Bearer qa-only' })).status, 204);
    assert.equal(received[1]!.auth, 'Bearer qa-only');
    assert.equal(received[1]!.path, '/api/v1/admin/client-errors?platform=ios');
    assert.equal((await request(base, '/api/v1/admin/client-errors', {}, 'POST', '{}')).status, 405);
    assert.equal((await request(base, '/api/v1/diagnostics/errors')).status, 405);
  } finally { await close(server); await close(upstream); }
});

test('Metro preview reaches a fixed API, keeps queries/status, and excludes browser credentials', async () => {
  const received: { path: string; headers: http.IncomingHttpHeaders }[] = [];
  const upstream = http.createServer((req, res) => {
    received.push({ path: req.url!, headers: req.headers });
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'secret=never-forward', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify([{ id: 'event-from-staging' }]));
  });
  const api = await listen(upstream);
  const proxy = createApiProxy(api + '/api/v1');
  const server = http.createServer((req, res) => proxy(req, res, () => { res.writeHead(418); res.end('Metro'); }));
  const base = await listen(server);
  try {
    const path = '/api/v1/events?q=house%20%26%20techno&page=2';
    const result = await request(base, path, { origin: base, cookie: 'web-session=secret', authorization: 'Bearer ignored' });
    assert.equal(result.status, 200); assert.deepEqual(JSON.parse(result.body), [{ id: 'event-from-staging' }]);
    assert.equal(received[0]!.path, path);
    for (const name of ['cookie', 'origin']) assert.equal(received[0]!.headers[name], undefined);
    assert.equal(received[0]!.headers.authorization, 'Bearer ignored');
    assert.equal(result.headers['set-cookie'], undefined); assert.equal(result.headers['access-control-allow-origin'], undefined);
    assert.equal((await request(base, '/index.bundle')).status, 418);
    assert.equal((await request(base, '/api/v10/events')).status, 418);
    for (const path of ['/api/v1/../../private', '/api/v1/%2e%2e/%2e%2e/private']) assert.equal((await request(base, path)).status, 400);
    assert.equal((await request(base, '/api/v1/events', { origin: 'https://external.test' })).status, 403);
    assert.equal((await request(base, '/api/v1/events', { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await request(base, '/api/v1/events', {}, 'POST')).status, 405);
    assert.equal((await request(base, '/api/v1/auth/activate?token=never-forward')).status, 403);
    assert.equal((await request(base, '/api/v1/events/../auth/google/callback')).status, 403);
    assert.equal(received.length, 1);
  } finally { await close(server); await close(upstream); }
});

test('account proxy forwards JSON, bearer auth and raw image bytes only to allowed operations', async () => {
  const received: { path: string; method?: string; headers: http.IncomingHttpHeaders; body: Buffer }[] = [];
  const upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => { received.push({ path: req.url!, method: req.method, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(204); res.end(); });
  });
  const api = await listen(upstream), proxy = createApiProxy(api + '/api/v1');
  const server = http.createServer((req, res) => proxy(req, res, () => res.end())), base = await listen(server);
  try {
    const json = JSON.stringify({ email: 'local@example.test', password: 'not-a-real-account' });
    assert.equal((await request(base, '/api/v1/auth/login', { origin: base, 'content-type': 'application/json', cookie: 'never-forward' }, 'POST', json)).status, 204);
    assert.equal(received[0]!.body.toString(), json);
    assert.equal(received[0]!.headers.cookie, undefined);
    const bytes = Buffer.from([0, 1, 128, 255]);
    assert.equal((await request(base, '/api/v1/users/me/avatar', { origin: base, 'content-type': 'image/webp', authorization: 'Bearer test-token' }, 'POST', bytes)).status, 204);
    assert.deepEqual(received[1]!.body, bytes);
    assert.equal(received[1]!.headers.authorization, 'Bearer test-token');
    assert.equal(received[1]!.headers['content-type'], 'image/webp');
    assert.equal((await request(base, '/api/v1/users/me/hidden-categories/DRUM%20%26%20BASS', { origin: base }, 'DELETE')).status, 204);
    assert.equal((await request(base, '/api/v1/users/me', { origin: 'https://external.test' }, 'DELETE')).status, 403);
    assert.equal((await request(base, '/api/v1/auth/google', { origin: base })).status, 403);
    assert.equal((await request(base, '/api/v1/auth/login', { origin: base }, 'GET')).status, 405);
    assert.equal((await request(base, '/api/v1/auth/login', { origin: base, 'content-length': '100000' }, 'POST')).status, 413);
    assert.equal(received.length, 3);
    assert.equal((await request(base, '/api/v1/feed', { authorization: 'Bearer test-token' })).status, 204);
    assert.equal((await request(base, '/api/v1/friends/request/12345678-abcd-abcd-abcd-123456789012', { 'content-type': 'application/json', authorization: 'Bearer test-token' }, 'PUT', '{"status":"accepted"}')).status, 204);
    assert.equal(received[4]!.method, 'PUT');
    assert.equal(received[4]!.body.toString(), '{"status":"accepted"}');
    assert.equal((await request(base, '/api/v1/feed', {}, 'POST')).status, 405);
  } finally { await close(server); await close(upstream); }
});

test('checkout proxy forwards idempotency and permits only the intended payment and billing operations', async () => {
  const received: http.IncomingHttpHeaders[] = [];
  const upstream = http.createServer((req, res) => { received.push(req.headers); req.resume(); res.writeHead(204); res.end(); });
  const api = await listen(upstream), proxy = createApiProxy(api + '/api/v1');
  const server = http.createServer((req, res) => proxy(req, res, () => res.end())), base = await listen(server);
  const id = '12345678-abcd-4bcd-8bcd-123456789012', headers = { origin: base, 'content-type': 'application/json', 'idempotency-key': id };
  try {
    for (const path of ['/events/' + id + '/tickets/purchase', '/events/' + id + '/tickets/book', '/events/' + id + '/promo-code/validate', '/checkout/reconcile']) assert.equal((await request(base, '/api/v1' + path, headers, 'POST', '{}')).status, 204);
    assert.equal(received[0]!['idempotency-key'], id);
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await request(base, '/api/v1/users/me/billing-details', headers, method, method === 'PUT' ? '{}' : undefined)).status, 204);
    assert.equal((await request(base, '/api/v1/checkout/reconcile', headers, 'GET')).status, 405);
    assert.equal((await request(base, '/api/v1/events/' + id + '/tickets/purchase', headers, 'DELETE')).status, 405);
  } finally { await close(server); await close(upstream); }
});

test('proxy preserves API errors, rejects redirects, times out and recovers', async () => {
  const upstream = http.createServer((req, res) => {
    if (req.url!.endsWith('?mode=slow')) return;
    if (req.url!.endsWith('?mode=redirect')) { res.writeHead(302, { Location: 'https://external.test' }); res.end(); return; }
    res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '30' }); res.end('{"error":"rate_limited"}');
  });
  const api = await listen(upstream);
  const proxy = createApiProxy(api + '/api/v1', { timeoutMs: 100 });
  const server = http.createServer((req, res) => proxy(req, res, () => res.end()));
  const base = await listen(server);
  try {
    const result = await request(base, '/api/v1/events');
    assert.equal(result.status, 429); assert.equal(result.headers['retry-after'], '30'); assert.equal(JSON.parse(result.body).error, 'rate_limited');
    assert.equal((await request(base, '/api/v1/events?mode=redirect')).status, 502);
    assert.equal((await request(base, '/api/v1/events?mode=slow')).status, 504);
    assert.equal((await request(base, '/api/v1/events')).status, 429);
  } finally { await close(server); await close(upstream); }
});

test('public profiles preview supports search, updates and follow with exact method boundaries', async () => {
  const received: { url?: string; method?: string; auth?: string }[] = [];
  const upstream = http.createServer((req, res) => { received.push({ url: req.url, method: req.method, auth: req.headers.authorization }); req.resume(); res.writeHead(204); res.end(); });
  const api = await listen(upstream), proxy = createApiProxy(api + '/api/v1');
  const server = http.createServer((req, res) => proxy(req, res, () => res.end())), base = await listen(server);
  const id = '12345678-abcd-4bcd-8bcd-123456789012', headers = { origin: base, authorization: 'Bearer test-only' };
  try {
    for (const path of ['/profiles/search?q=Alex%20%26%20Bea', '/organizers/' + id + '/updates', '/events/' + id + '/updates']) assert.equal((await request(base, '/api/v1' + path, headers)).status, 204);
    for (const method of ['POST', 'DELETE']) assert.equal((await request(base, '/api/v1/organizers/' + id + '/follow', headers, method)).status, 204);
    assert.equal(received.length, 5); assert.equal(received[0]?.url, '/api/v1/profiles/search?q=Alex%20%26%20Bea');
    assert.ok(received.every(row => row.auth === 'Bearer test-only'));
    assert.equal((await request(base, '/api/v1/profiles/search', headers, 'POST')).status, 405);
    assert.equal((await request(base, '/api/v1/organizers/' + id + '/follow', headers)).status, 405);
    assert.equal((await request(base, '/api/v1/organizers/' + id + '/updates', headers, 'DELETE')).status, 405);
    assert.equal((await request(base, '/api/v1/organizers/' + id + '/private', headers)).status, 403);
  } finally { await close(server); await close(upstream); }
});

test('proxy cancels an upstream request when its browser client disconnects', async () => {
  let received!: () => void, disconnected!: () => void;
  const started = new Promise<void>(resolve => { received = resolve; });
  const stopped = new Promise<void>(resolve => { disconnected = resolve; });
  const upstream = http.createServer((_req, res) => { res.once('close', disconnected); received(); });
  const api = await listen(upstream), proxy = createApiProxy(api + '/api/v1');
  const server = http.createServer((req, res) => proxy(req, res, () => res.end())), base = await listen(server);
  try {
    const client = http.get(base + '/api/v1/events'); client.on('error', () => {});
    await started; client.destroy();
    await Promise.race([stopped, new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('Upstream not cancelled')), 1000); timeout.unref(); })]);
  } finally { await close(server); await close(upstream); }
});
