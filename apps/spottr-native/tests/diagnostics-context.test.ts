import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diagnosticEndpoint, diagnosticMessages, diagnosticSource, httpDiagnostic, parseDiagnosticContext } from '../../pulse-app/src/features/diagnostics/context';
import { parseReport, reportError } from '../../pulse-app/src/features/diagnostics/report';
import { diagnosticVersions } from '../src/diagnostics/metadata';
import { ApiError, createHttp } from '../src/data/http';
import { bindHandledReporting } from '../src/diagnostics/handled';

const requestId = '583f24c4-53cd-482e-a324-487a9b7c2846';
const context = { id: requestId, occurredAt: new Date().toISOString(), platform: 'ios' as const,
  appVersion: '1.2.3', buildVersion: '42', osVersion: '27.0', fatal: false, screen: 'Home' as const, breadcrumbs: ['Home'] };

test('native binary versions win, invalid/null metadata falls back safely and Expo Go is not misidentified', () => {
  const native = { nativeApplicationVersion: '1.2.3', nativeBuildVersion: '42' };
  const config = { version: '0.1.0', ios: { buildNumber: '2' }, android: { versionCode: 3 } };
  assert.deepEqual(diagnosticVersions(native, config, 'ios'), { appVersion: '1.2.3', buildVersion: '42' });
  assert.deepEqual(diagnosticVersions(native, config, 'ios', true), { appVersion: '0.1.0', buildVersion: '2' });
  assert.deepEqual(diagnosticVersions({ nativeApplicationVersion: null, nativeBuildVersion: 'bad secret' }, config, 'android'), { appVersion: '0.1.0', buildVersion: '3' });
  assert.deepEqual(diagnosticVersions({ nativeApplicationVersion: null, nativeBuildVersion: null }, null, 'web'), { appVersion: 'unknown', buildVersion: 'unknown' });
});

test('client/server diagnostic catalogs use exactly the same fixed messages', () => {
  const source = readFileSync(resolve(__dirname, '../../../api/internal/diagnostics/context.go'), 'utf8');
  const server = Object.fromEntries([...source.matchAll(/"([A-Z_]+)":\s*"([^"\n]+)"/g)].map(match => [match[1], match[2]]));
  assert.deepEqual(server, diagnosticMessages);
});

test('raw backend data and identifiers never enter diagnostics or persisted/exportable reports', async t => {
  const raw = 'private@example.test Bearer sk_test_private cs_live_private';
  let report: unknown;
  bindHandledReporting((error, detail) => { report = reportError(error, { ...context, ...detail }); });
  t.after(() => bindHandledReporting(undefined));
  const api = createHttp('https://example.test/api/v1', async () => new Response(JSON.stringify({ error: raw, code: raw, diagnosticCode: raw }),
    { status: 503, headers: { 'X-Request-ID': requestId } }));
  await assert.rejects(api('/events/' + requestId + '/tickets/purchase?email=' + raw, { method: 'POST', body: { password: raw } }), ApiError);
  const parsed = parseReport(report);
  assert.equal(parsed.errorCode, 'HTTP_SERVICE_UNAVAILABLE');
  assert.equal(parsed.category, 'network');
  assert.equal(parsed.errorSource, 'api');
  assert.equal(parsed.endpoint, 'checkout');
  assert.equal(parsed.httpMethod, 'POST');
  assert.equal(parsed.requestId, requestId);
  for (const marker of ['private@example', 'Bearer', 'sk_test_', 'cs_live_', 'password', '/events/', '?email='])
    assert.equal(JSON.stringify(parsed).includes(marker), false, marker);
  const database = httpDiagnostic('/users/me/tickets', 'GET', 500, requestId, 'DATABASE_ERROR');
  assert.equal(database.errorCode, 'DATABASE_ERROR');
  const databaseApi = createHttp('https://example.test/api/v1', async () => new Response(JSON.stringify({ error: raw, diagnosticCode: 'DATABASE_ERROR' }),
    { status: 500, headers: { 'X-Request-ID': requestId } }));
  await assert.rejects(databaseApi('/users/me/tickets'), ApiError);
  const databaseReport = parseReport(report);
  assert.equal(databaseReport.errorCode, 'DATABASE_ERROR');
  assert.equal(databaseReport.endpoint, 'tickets');
  assert.equal(databaseReport.httpMethod, 'GET');
  assert.equal(databaseReport.requestId, requestId);
  assert.equal(diagnosticEndpoint('/users/me/tickets?token=private'), 'tickets');
  for (const path of ['/events/private@example.test', '/events/cs_live_private', '/users/me/tickets#private', '/events/%61', '//host/path', '/private'])
    assert.equal(diagnosticEndpoint(path), 'other');
  assert.equal(httpDiagnostic('/users/me/tickets', 'INVALID', 503, 'Bearer private', null).httpMethod, undefined);
  assert.equal(httpDiagnostic('/users/me/tickets', 'GET', 503, 'Bearer private', null).requestId, undefined);
});

test('context is backward compatible but rejects partial, untrusted and inconsistent context', () => {
  assert.deepEqual(parseDiagnosticContext({}), {});
  const code = 'HTTP_SERVICE_UNAVAILABLE';
  const valid = { ...httpDiagnostic('/users/me/tickets', 'GET', 503, requestId, undefined), httpStatus: 503, failure: 'server_error' };
  assert.equal(parseDiagnosticContext(valid).safeMessage, diagnosticMessages[code]);
  for (const patch of [{ safeMessage: 'private' }, { errorCode: 'sk_test_private' }, { errorSource: 'private' }, { endpoint: '/users/private' },
    { requestId: 'private' }, { httpStatus: undefined }, { httpMethod: undefined }, { errorCode: undefined }, { errorSource: undefined },
    { errorCode: 'JS_PROPERTY_ACCESS', safeMessage: diagnosticMessages.JS_PROPERTY_ACCESS, errorSource: 'javascript' }])
    assert.throws(() => parseDiagnosticContext({ ...valid, ...patch }), /INVALID_DIAGNOSTIC/);
  for (const value of [null, undefined, 3, 'private']) assert.throws(() => parseDiagnosticContext(value));
  for (const failure of ['storage_error', 'invalid_response', undefined]) assert.throws(() => parseDiagnosticContext({ ...valid, failure }));
  const js = reportError({ message: 'Cannot read properties of undefined private@example.test', cause: new Error('secret') }, context);
  assert.equal(js.errorCode, 'JS_PROPERTY_ACCESS');
  assert.equal(js.safeMessage, diagnosticMessages.JS_PROPERTY_ACCESS);
  assert.equal(js.errorSource, diagnosticSource('JS_PROPERTY_ACCESS'));
  assert.equal(JSON.stringify(js).includes('private@example'), false);
});

test('malicious diagnostic objects cannot replace fixed messages or affect application errors', () => {
  const base = { ...context, operation: 'tickets_load' as const, failure: 'server_error' as const, httpStatus: 503 };
  const malicious = { message: 'private', diagnostic: { errorCode: 'DATABASE_ERROR', safeMessage: 'private', requestId: 'private' } };
  const report = reportError(malicious, base);
  assert.equal(report.errorCode, 'HTTP_SERVICE_UNAVAILABLE');
  assert.equal(JSON.stringify(report).includes('private'), false);
  const legacy = { ...report }; delete legacy.errorCode; delete legacy.errorSource; delete legacy.safeMessage;
  assert.equal(parseReport(legacy).operation, 'tickets_load');
});

test('multiline messages cannot inject private values through stack-frame syntax', () => {
  const marker = 'CustomerPrivateMarker';
  const error = new Error(`oops\n    at ${marker} (index.js:1:2)`);
  const js = reportError(error, context);
  assert.equal(JSON.stringify(js).includes(marker), false);
  const handled = reportError(error, { ...context, operation: 'tickets_load', failure: 'server_error', httpStatus: 503 });
  assert.deepEqual(handled.frames, []);
  assert.equal(JSON.stringify(handled).includes(marker), false);
  const forged = reportError({ name: 'Error', message: 'secret', stack: `Error: something else\n    at ${marker} (index.js:1:2)` }, context);
  assert.deepEqual(forged.frames, []);
  assert.doesNotThrow(() => reportError({ name: 'Error', message: 'x'.repeat(2001), get stack() { throw Error('must not read an unbounded stack'); } }, context));
});
