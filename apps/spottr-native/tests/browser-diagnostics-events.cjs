// Real Chrome ErrorEvent/PromiseRejectionEvent through the actual listener,
// sanitizer, queue and sender. No remote service or app export is involved.
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const path = require('node:path');
const { withBrowser } = require('./browser-harness.cjs');
const bundle = buildSync({ stdin: { resolveDir: path.resolve(__dirname, '..'), contents: `
  import { installBrowserErrorReporting } from './src/diagnostics/browserErrors';
  import { createErrorReporter } from './src/diagnostics/reporter';
  const qa = window.__diagnosticEvents = { reports: [], persisted: '', sequence: 0 };
  const reporter = createErrorReporter({
    metadata: { platform: 'web', appVersion: '0.1.0', buildVersion: 'unknown', osVersion: 'unknown' },
    id: () => '00000000-0000-4000-8000-' + String(++qa.sequence).padStart(12, '0'),
    storage: { read: async () => null, write: async value => { qa.persisted = value; } },
    send: async report => { qa.reports.push(report); return { status: 204 }; },
  });
  reporter.setScreen('Explore');
  installBrowserErrorReporting(window, (error, fatal) => { void reporter.capture(error, fatal); });
` }, bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022' }).outputFiles[0].text;

withBrowser(async ({ call, evaluate, until, errors }) => {
  await evaluate(bundle);
  await evaluate(`window.dispatchEvent(new ErrorEvent('error', {
    error: null, message: 'Uncaught TypeError: Cannot read properties of undefined person@example.test',
    filename: 'https://private.invalid/private/index.bundle?token=Bearer-private', lineno: 123, colno: 45
  }))`);
  await until('window.__diagnosticEvents.reports.length === 1');
  const first = await evaluate('window.__diagnosticEvents.reports[0]');
  assert.equal(first.fatal, true);
  assert.equal(first.screen, 'Explore');
  assert.equal(first.errorCode, 'JS_PROPERTY_ACCESS');
  assert.deepEqual(first.frames, [{ file: 'index.bundle', function: 'anonymous', line: 123, column: 45 }]);
  await evaluate(`window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
    promise: Promise.resolve(), reason: 'ReferenceError: missingValue is not defined private@example.test'
  }))`);
  await until('window.__diagnosticEvents.reports.length === 2');
  const second = await evaluate('window.__diagnosticEvents.reports[1]');
  assert.equal(second.fatal, false);
  assert.equal(second.errorCode, 'JS_UNDEFINED_IDENTIFIER');
  assert.deepEqual(second.frames, []);
  const captured = await evaluate('JSON.stringify({reports:window.__diagnosticEvents.reports,persisted:window.__diagnosticEvents.persisted})');
  for (const secret of ['person@', 'private@example', 'private.invalid', '/private/', 'Bearer-private', 'token='])
    assert.equal(captured.includes(secret), false, secret);
  assert.deepEqual(errors, []);
  console.log('PASS real Chrome null ErrorEvent and string PromiseRejectionEvent retain sanitized diagnostics through reporter delivery');
}).catch(error => { console.error(error); process.exitCode = 1; });
