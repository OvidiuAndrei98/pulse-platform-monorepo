import assert from 'node:assert/strict';
import test from 'node:test';
import { createSheetScrollDiagnostics, type SheetScrollSample } from '../src/ui/sheetScrollDiagnostics';

const sample: SheetScrollSample = {
  phase: 'release', y: 440, contentHeight: 1800, viewportHeight: 760,
  insetTop: 0, insetBottom: 0, targetY: 900, position: 84.4000001, highest: 84.4,
  locked: false, atOpen: true, handleState: 0, contentState: 5,
  animationStatus: 2, sheetState: 2, localOffset: 440, panOffset: 0,
};

test('scroll report retains the measurements needed to separate native rebound from scroll locking', () => {
  let now = 100;
  const diagnostic = createSheetScrollDiagnostics(() => now);
  diagnostic.record(sample);
  now = 350;
  diagnostic.record({ ...sample, phase: 'momentum-end', y: 900 });
  const report = JSON.parse(diagnostic.report());
  assert.equal(report.diagnostic, 'spottr-sheet-scroll-2026-10-12-a');
  assert.equal(report.samples[0].ms, 0);
  assert.equal(report.samples[1].ms, 250);
  assert.equal(report.samples[0].position, 84.4000001);
  assert.equal(report.samples[0].highest, 84.4);
  assert.equal(report.samples[1].y, 900);
});

test('diagnostics are bounded and exclude non-measurement data and invalid numbers', () => {
  const diagnostic = createSheetScrollDiagnostics(() => 0);
  for (let index = 0; index < 100; index++) diagnostic.record({ ...sample, y: index });
  const samples = JSON.parse(diagnostic.report()).samples;
  assert.equal(samples.length, 48);
  assert.equal(samples[0].y, 52);
  diagnostic.record({ ...sample, y: NaN, targetY: Infinity, token: 'do-not-copy', eventTitle: 'Private event', email: 'private@example.test' } as SheetScrollSample);
  const report = diagnostic.report();
  assert.equal(report.includes('do-not-copy'), false);
  assert.equal(report.includes('Private event'), false);
  assert.equal(report.includes('private@example.test'), false);
  assert.equal('y' in JSON.parse(report).samples.at(-1), false);
  assert.equal('targetY' in JSON.parse(report).samples.at(-1), false);
});
