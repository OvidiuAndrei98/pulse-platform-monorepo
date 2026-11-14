import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const { withNormalizedProxyHeaders } = createRequire(import.meta.url)('../scripts/metro-proxy-headers.cjs');

test('Expo tunnel duplicate protocols remain valid Metro bundle and asset URLs', async () => {
  const received: { url: string; authorization?: string; host?: string }[] = [];
  const server = http.createServer(withNormalizedProxyHeaders((req: http.IncomingMessage, res: http.ServerResponse) => {
    // This is how Metro constructs its bundle URL, including its forwarded host.
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = new URL(req.url!, `${protocol}://${host}`);
    received.push({ url: url.href, authorization: req.headers.authorization, host: req.headers.host });
    res.end('loaded');
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const protocol of ['https', 'https, https', 'HTTPS, https', 'http, http']) {
      for (const path of ['/apps/spottr-native/index.ts.bundle?platform=ios&dev=false', '/assets/test.png']) {
        const response = await fetch(base + path, { headers: {
          'X-Forwarded-Proto': protocol, 'X-Forwarded-Host': 'preview.exp.direct', Authorization: 'Bearer test-only',
        } });
        assert.equal(response.status, 200);
        assert.equal(await response.text(), 'loaded');
        assert.deepEqual(received.at(-1), {
          url: `${protocol.toLowerCase().startsWith('https') ? 'https' : 'http'}://preview.exp.direct${path}`,
          authorization: 'Bearer test-only', host: new URL(base).host,
        });
      }
    }
    const local = await fetch(base + '/status');
    assert.equal(local.status, 200); await local.text();
    assert.equal(received.at(-1)!.url, base + '/status');
    const before = received.length;
    for (const protocol of ['https, http', 'https,', 'javascript', 'https://bad.test', '']) {
      const response = await fetch(base + '/index.bundle', { headers: { 'X-Forwarded-Proto': protocol } });
      assert.equal(response.status, 400);
      assert.equal(await response.text(), 'Invalid forwarded protocol.');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.equal(received.length, before, 'Invalid protocols never reach Metro');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
