import assert from 'node:assert/strict';
import test from 'node:test';
import { reportError, parseReport } from '@packages/app-core/diagnostics/report';
import { browserErrorValue, installBrowserErrorReporting } from '../src/diagnostics/browserErrors';

const context = { id: '00000000-0000-4000-8000-000000000001', occurredAt: '2026-11-15T08:00:00Z',
  platform: 'web' as const, appVersion: '0.1.0', buildVersion: 'unknown', osVersion: 'unknown',
  screen: 'Explore' as const, breadcrumbs: ['Home', 'Explore'], fatal: true };
const event = (overrides: Partial<ErrorEvent> = {}) => ({ error: null,
  message: 'Uncaught TypeError: Cannot read properties of undefined person@example.test',
  filename: 'http://localhost:8083/private/index.bundle?token=Bearer-private', lineno: 123, colno: 45,
  ...overrides });

test('a null ErrorEvent.error retains the actual source and classification without raw text or URLs', () => {
  const report = parseReport(reportError(browserErrorValue(event()), context));
  assert.equal(report.errorType, 'Error');
  assert.equal(report.errorCode, 'JS_PROPERTY_ACCESS');
  assert.deepEqual(report.frames, [{ file: 'index.bundle', function: 'anonymous', line: 123, column: 45 }]);
  for (const privateValue of ['person@', 'Bearer-private', 'localhost', 'http:', '/private/', 'token='])
    assert.equal(JSON.stringify(report).includes(privateValue), false);
});

test('real error objects retain their own stack instead of using a fallback location', () => {
  const original = new ReferenceError('not defined');
  original.stack = 'ReferenceError: not defined\n    at renderEvent (index.bundle:22:8)';
  assert.equal(browserErrorValue(event({ error: original })), original);
  assert.deepEqual(reportError(browserErrorValue(event({ error: original })), context).frames,
    [{ file: 'index.bundle', function: 'renderEvent', line: 22, column: 8 }]);
});

test('missing or malformed browser locations cannot invent a source or inject stack frames', () => {
  for (const patch of [{ filename: '' }, { lineno: 0 }, { lineno: -1 }, { colno: NaN },
    { filename: 'index.bundle:1:2\n at CustomerPrivateMarker (secret.js' }]) {
    const report = reportError(browserErrorValue(event(patch)), context);
    assert.deepEqual(report.frames, []);
    assert.equal(JSON.stringify(report).includes('CustomerPrivateMarker'), false);
  }
  const message = 'oops\n    at CustomerPrivateMarker (index.bundle:8:9)';
  const report = reportError(browserErrorValue(event({ message })), context);
  assert.equal(JSON.stringify(report).includes('CustomerPrivateMarker'), false);
  assert.deepEqual(report.frames, [{ file: 'index.bundle', function: 'anonymous', line: 123, column: 45 }]);
});

test('browser listeners collect null and string exceptions while preserving fatal and rejection semantics', () => {
  const handlers = new Map<string, (event: unknown) => void>();
  const captured: ReturnType<typeof reportError>[] = [];
  installBrowserErrorReporting({ addEventListener: ((name: string, callback: (event: unknown) => void) => {
    handlers.set(name, callback);
  }) as Window['addEventListener'] }, (error, fatal = false) => captured.push(reportError(error, { ...context, fatal })));
  handlers.get('error')!(event());
  handlers.get('error')!(event({ error: 'ReferenceError: missingValue is not defined', filename: '' }));
  handlers.get('unhandledrejection')!({ reason: 'Cannot read properties of null private@example.test' });
  assert.equal(captured[0]!.fatal, true);
  assert.equal(captured[0]!.frames[0]!.line, 123);
  assert.equal(captured[1]!.errorCode, 'JS_UNDEFINED_IDENTIFIER');
  assert.equal(captured[2]!.errorCode, 'JS_PROPERTY_ACCESS');
  assert.equal(captured[2]!.fatal, false);
  assert.deepEqual(captured[2]!.frames, [], 'A string rejection has no known call site');
  assert.equal(JSON.stringify(captured).includes('private@example'), false);
});
