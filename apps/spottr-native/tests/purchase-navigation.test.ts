import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Run the real navigation decisions; only the native navigation runtime is stubbed.
const exported: any = {};
const popTo = (name: string, params: unknown, options: unknown) => ({ type: 'POP_TO', payload: { name, params, options } });
runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/returnToEvent.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: exported,
  require: (name: string) => {
    assert.equal(name, '@react-navigation/native');
    return { StackActions: { popTo } };
  },
});
function run(state: unknown, id = 'paid-event') {
  const calls: any[] = [];
  exported.returnToEvent({ getState: () => state, popTo: (...args: any[]) => calls.push(['pop', ...args]), dispatch: (action: unknown) => calls.push(['dispatch', action]) }, id);
  return JSON.parse(JSON.stringify(calls));
}
const details = { name: 'EventDetails', params: { id: 'paid-event', presentation: 'sheet' } };
const inner = { key: 'purchase-stack', routes: [details, { name: 'Checkout' }] };

test('warm checkout pops within its event stack and merges without replacing presentation', () => {
  assert.deepEqual(run({ routeNames: ['EventDetails', 'Checkout', 'CheckoutReturn'], routes: inner.routes }), [
    ['pop', 'EventDetails', { id: 'paid-event' }, { merge: true }],
  ]);
});

test('root return removes the existing checkout and preserves the mounted event route params', () => {
  const params = { id: 'paid-event', presentation: 'sheet', source: 'home' };
  const calls = run({ routeNames: ['Tabs', 'Event', 'CheckoutReturn'], routes: [
    { name: 'Tabs' }, { name: 'Event', params, state: inner }, { name: 'CheckoutReturn' },
  ] });
  assert.equal(calls[0][1].target, 'purchase-stack');
  assert.equal(calls[0][1].payload.name, 'EventDetails');
  assert.deepEqual(calls[1], ['pop', 'Event', params, { merge: true }]);
});

test('return locates a nested event without replacing its outer event route', () => {
  const params = { id: 'outer-event', presentation: 'sheet' };
  const calls = run({ routeNames: ['Tabs', 'Event', 'CheckoutReturn'], routes: [
    { name: 'Event', params, state: { key: 'outer-stack', routes: [
      { name: 'EventDetails', params: { id: 'outer-event' } }, { name: 'Event', state: inner },
    ] } }, { name: 'CheckoutReturn' },
  ] });
  assert.equal(calls[0][1].target, 'purchase-stack');
  assert.deepEqual(calls[1][2], params);
});

test('cold return opens the paid event; unrelated event stacks are never targeted', () => {
  for (const routes of [[], [{ name: 'Event', params: { id: 'different' }, state: { key: 'unrelated', routes: [{ name: 'EventDetails', params: { id: 'different' } }] } }]]) {
    assert.deepEqual(run({ routeNames: ['Tabs', 'Event', 'CheckoutReturn'], routes }), [
      ['pop', 'Event', { id: 'paid-event' }, { merge: true }],
    ]);
  }
});
