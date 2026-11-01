import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const nativeRequire = createRequire(require.resolve('@react-navigation/native/package.json'));
const coreRequire = createRequire(nativeRequire.resolve('@react-navigation/core/package.json'));
const { StackRouter, CommonActions, StackActions } = coreRequire('@react-navigation/routers');
const { getStateFromPath } = require(resolve(dirname(nativeRequire.resolve('@react-navigation/core/package.json')), 'lib/module/getStateFromPath.js'));
function load(os = 'ios') {
  const exports: any = {};
  runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/accountNavigation.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name: string) {
    if (name === 'react-native') return { Platform: { OS: os } };
    if (name === '@react-navigation/native') return { CommonActions, StackActions };
    throw Error(name);
  } });
  return exports;
}

for (const page of ['Tickets', 'Orders', 'SavedEvents']) test(`iOS ${page} pushes above the existing Profile and Back restores that same tab navigator`, () => {
  const { openAccountPage } = load();
  const router = StackRouter({ initialRouteName: 'Tabs' });
  const options = { routeNames: ['Tabs', 'Search', 'Tickets', 'Orders', 'SavedEvents', 'Event'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  state.routes[0].params = { screen: 'Profile' };
  const key = state.routes[0].key;
  const root = { dispatch(action: any) { state = router.getStateForAction(state, action, options); } };
  const tab = { getParent: () => root, dispatch() { throw Error('Account pages must be opened at the root'); } };
  openAccountPage(tab, page);
  assert.deepEqual(state.routes.map((r: any) => r.name), ['Tabs', page]);
  assert.equal(state.routes[0].key, key);
  root.dispatch(CommonActions.goBack());
  assert.equal(state.routes.length, 1);
  assert.equal(state.routes[0].key, key);
  assert.equal(state.routes[0].params.screen, 'Profile');
});

test('leaving checkout opens Tickets from the surviving root and cannot return to checkout', () => {
  const { openAccountPage } = load();
  const router = StackRouter({ initialRouteName: 'Tabs' });
  const options = { routeNames: ['Tabs', 'Event', 'Tickets'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  const root = { dispatch(action: any) { state = router.getStateForAction(state, action, options); } };
  root.dispatch(CommonActions.navigate('Event'));
  const checkout = { getParent: () => root, dispatch() { throw Error('Checkout navigation is removed by the first action'); } };
  openAccountPage(checkout, 'Tickets', true);
  assert.deepEqual(state.routes.map((r: any) => r.name), ['Tabs', 'Tickets']);
  assert.equal(state.routes[0].params.screen, 'Profile');
  root.dispatch(CommonActions.goBack());
  assert.equal(state.routes[0].name, 'Tabs');
});

test('web and Android retain their nested profile destinations and checkout pop behavior', () => {
  for (const os of ['web', 'android']) {
    const { openAccountPage } = load(os), actions: any[] = [], navigation = { dispatch: (a: any) => actions.push(a) };
    openAccountPage(navigation, 'Orders'); openAccountPage(navigation, 'Tickets', true);
    assert.equal(actions[0].type, 'NAVIGATE'); assert.equal(actions[0].payload.params.params.screen, 'Orders');
    assert.equal(actions[1].type, 'POP_TO'); assert.equal(actions[1].payload.params.params.screen, 'Tickets');
    assert.ok(actions.every(a => a.payload.name === 'Tabs'));
  }
});

test('cold iOS account links preserve existing URLs and put Profile behind the page', () => {
  const { accountPagePaths, accountLinkOrigin } = load();
  const config = { initialRouteName: 'Tabs', screens: { Tabs: { screens: { Home: '', Profile: 'users/me' } }, ...accountPagePaths, Search: 'search' } };
  for (const [page, path] of Object.entries(accountPagePaths)) {
    const state = accountLinkOrigin(getStateFromPath(path, config));
    assert.equal(state.routes.at(-1).name, page);
    assert.equal(state.routes[0].name, 'Tabs');
    assert.equal(state.routes[0].params.screen, 'Profile');
  }
  const search = getStateFromPath('search', config);
  assert.equal(accountLinkOrigin(search), search, 'Home/Search routing is unchanged');
  assert.equal(accountLinkOrigin(undefined), undefined);
});
