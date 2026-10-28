import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttp } from '../src/data/http';
import { createScannerApi, parseScanHistory } from '../src/scanner/data';

const id = '00000000-0000-4000-8000-000000000001';
const scan = { ticketId: id, ticketType: 'VIP', validatedAt: '2026-10-14T01:00:00.123456Z', scannedBy: { userId: id, kind: 'user', name: 'Franco' } };
test('history retains actor identity and cursor, and never guesses names for deleted accounts', () => {
  const result = parseScanHistory({ totalScans: 42, scans: [scan], nextCursor: 'opaque_cursor' });
  assert.equal(result.scans[0]!.scannedBy.name, 'Franco');
  assert.equal(result.nextCursor, 'opaque_cursor');
  assert.equal(result.scans[0]!.validatedAt, scan.validatedAt);
  assert.equal(parseScanHistory({ totalScans: 1, scans: [{ ...scan, scannedBy: { kind: 'unknown', name: '' } }] }).scans[0]!.scannedBy.name, '');
  for (const value of [{totalScans:-1,scans:[]}, {totalScans:1,scans:[{...scan,scannedBy:undefined}]}, {totalScans:1,scans:[{...scan,validatedAt:'bad'}]}, {totalScans:1,scans:[{...scan,scannedBy:{name:'Someone',kind:'fake'}}]}, {totalScans:1,scans:[scan],nextCursor:'../evil'}]) assert.throws(() => parseScanHistory(value));
});
test('history requests filter on the server, carry authentication/cancellation, and reject malformed routing', async () => {
  const requests: {url:string;options:RequestInit}[] = [];
  const api = createScannerApi(createHttp('https://example.invalid', async (url, options) => {
    requests.push({ url: String(url), options: options! });
    return new Response(JSON.stringify({ totalScans: 1, scans: [scan] }), {status:200});
  }));
  const abort = new AbortController();
  await api.historyPage(id, 'qa-only', 'all', undefined, abort.signal);
  await api.historyPage(id, 'qa-only', 'mine', 'next_page');
  assert.match(requests[0]!.url, /\/scans\?scope=all&limit=30$/);
  assert.match(requests[1]!.url, /scope=mine&limit=30&cursor=next_page$/);
  assert.equal((requests[0]!.options.headers as Record<string,string>).Authorization, 'Bearer qa-only');
  assert.ok(requests[0]!.options.signal);
  await assert.rejects(api.historyPage('../other', 'qa-only', 'all'));
  await assert.rejects(api.historyPage(id, 'qa-only', 'all', '&scope=mine'));
  assert.equal(requests.length, 2);
});
