import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const { hooks } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

test('Home prepares guest Sign in only while idle, without demoting an already mounted native screen', () => {
  const source = ts.createSourceFile('HomeScreen.tsx', readFileSync(resolve(__dirname, '../src/screens/HomeScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const activity = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'HomeActivity')!;
  const h = hooks(), queued = new Map<number, () => void>(), calls: string[] = [];
  const auth: any = { ready: true, user: { id: 'account' } };
  let sequence = 0, focused = true;
  const state: any = { routeNames: ['Tabs', 'Search', 'Auth'], routes: [{ name: 'Tabs' }], preloadedRoutes: [] };
  const navigation = { getParent: () => undefined, getState: () => state,
    preload: (name: string) => { calls.push(name); state.preloadedRoutes.push({ name, key: name + calls.length }); } };
  const ui: any = {};
  runInNewContext(ts.transpileModule(activity.getText(source) + '\nexport { HomeActivity };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: ui, useEffect: h.react.useEffect, useIsFocused: () => focused, useAuth: () => auth,
    useNavigation: () => navigation, Platform: { OS: 'ios' }, useHomeEvents() {}, useQuery() {}, manualRefreshOptions: {}, eventsApi: {},
    requestIdleCallback: (callback: () => void) => { const id = ++sequence; queued.set(id, callback); return id; },
    cancelIdleCallback: (id: number) => queued.delete(id) });
  const render = () => h.render(() => ui.HomeActivity());
  const idle = () => { const callbacks = [...queued.values()]; queued.clear(); callbacks.forEach(callback => callback()); };
  render(); assert.deepEqual(calls, [], 'No native mount during the current interaction');
  idle(); assert.deepEqual(calls, ['Search'], 'An authenticated account does not mount an unused Sign in screen');
  auth.user = null; render(); assert.deepEqual(calls, ['Search']);
  idle(); assert.deepEqual(calls, ['Search', 'Auth']);
  const prepared = state.preloadedRoutes.find((route: any) => route.name === 'Auth');
  state.preloadedRoutes = state.preloadedRoutes.filter((route: any) => route.name !== 'Auth');
  state.routes.push(prepared);
  focused = false; render(); focused = true; render(); idle();
  assert.deepEqual(calls, ['Search', 'Auth'], 'A visited Auth route must never be preloaded again with the same key');
  auth.user = { id: 'next-account' }; render(); auth.user = null; render();
  focused = false; render(); idle();
  assert.deepEqual(calls, ['Search', 'Auth'], 'Leaving Home cancels preparation');
  h.unmount();
});

test('a prepared Auth screen cannot redirect another account until it actually receives focus', () => {
  const source = ts.createSourceFile('AuthScreen.tsx', readFileSync(resolve(__dirname, '../src/screens/AuthScreen.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let redirect: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
      && node.arguments[0]?.getText(source).includes('navigation.popTo') && node.arguments[0].getText(source).includes('auth.ready')) redirect = node;
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(redirect);
  const calls: any[] = [], ui: any = {};
  const context: any = { exports: ui, focused: false, auth: { ready: true, user: { id: 'account', role: 'user' } },
    route: { params: { returnTab: 'Profile' } }, mode: 'login', isEventId: () => false,
    navigation: { popTo: (...args: any[]) => calls.push(args) }, useEffect: (effect: () => void) => effect() };
  runInNewContext(ts.transpileModule(`export function run() { ${redirect!.getText(source)}; }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  ui.run(); assert.equal(calls.length, 0);
  context.auth.user = { id: 'organizer', role: 'organizer' }; ui.run(); assert.equal(calls.length, 0);
  context.focused = true; ui.run(); assert.equal(calls.at(-1)[0], 'Dashboard');
  context.auth.user = { id: 'basic', role: 'user' }; ui.run();
  assert.equal(calls.at(-1)[0], 'Tabs'); assert.equal(calls.at(-1)[1].screen, 'Profile');
  context.auth.user = null; ui.run(); assert.equal(calls.length, 2);
});
