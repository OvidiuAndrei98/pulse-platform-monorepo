import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const nativeRequire = createRequire(require.resolve('@react-navigation/native/package.json'));
const coreRequire = createRequire(nativeRequire.resolve('@react-navigation/core/package.json'));
const { StackRouter, TabRouter, CommonActions, StackActions } = coreRequire('@react-navigation/routers');
const exports: any = {};
runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/profileStackRouter.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports });

function stack() {
  const original = StackRouter({ initialRouteName: 'Tabs' });
  const router = { ...original, ...exports.profileStackRouter(original) };
  const options = { routeNames: ['Tabs', 'Dashboard', 'Admin', 'Event', 'Auth'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  return { get state() { return state; }, dispatch(action: any) { state = router.getStateForAction(state, action, options) ?? state; return state; } };
}

for (const role of ['Dashboard', 'Admin']) test(`${role} keeps the same screen and state through repeated navbar returns`, () => {
  const nav = stack(), tabsKey = nav.state.routes[0].key;
  nav.dispatch(CommonActions.navigate(role, { section: 'profile' }));
  const profileKey = nav.state.routes.at(-1).key;
  for (let index = 0; index < 10; index++) {
    nav.dispatch(StackActions.popTo('Tabs', { screen: index % 2 ? 'Feed' : 'Home' }));
    assert.equal(nav.state.routes[0].key, tabsKey, 'The original tab navigator survives');
    assert.equal(nav.state.preloadedRoutes.length, 1);
    assert.equal(nav.state.preloadedRoutes[0].key, profileKey, 'The role screen stays mounted offscreen');
    assert.equal(nav.state.preloadedRoutes[0].params.section, 'profile');
    nav.dispatch(CommonActions.navigate(role, nav.state.preloadedRoutes[0].params));
    assert.equal(nav.state.routes.at(-1).key, profileKey, 'Re-entry adopts the existing native screen');
    assert.equal(nav.state.preloadedRoutes.length, 0);
  }
});

test('leaving a workspace drops transient pages while retaining the profile underneath', () => {
  const nav = stack();
  nav.dispatch(CommonActions.navigate('Dashboard'));
  const key = nav.state.routes.at(-1).key;
  nav.dispatch(CommonActions.navigate('Event', { id: 'event' }));
  nav.dispatch(StackActions.popTo('Tabs', { screen: 'Home' }));
  assert.deepEqual(nav.state.routes.map((route: any) => route.name), ['Tabs']);
  assert.equal(nav.state.preloadedRoutes.length, 1);
  assert.equal(nav.state.preloadedRoutes[0].key, key);
});

test('an explicit account reset discards cached role screens instead of restoring them', () => {
  const nav = stack();
  nav.dispatch(CommonActions.navigate('Admin'));
  nav.dispatch(CommonActions.reset({ ...nav.state, index: 0, routes: [nav.state.routes[0]], preloadedRoutes: [] }));
  assert.equal(nav.state.preloadedRoutes.length, 0);
  nav.dispatch(CommonActions.navigate('Dashboard'));
  nav.dispatch(StackActions.popTo('Tabs'));
  nav.dispatch(CommonActions.reset({ ...nav.state, preloadedRoutes: [] }));
  assert.equal(nav.state.preloadedRoutes.length, 0);
});

test('an administrator can move between Admin and the organizer account without rebuilding either', () => {
  const nav = stack();
  nav.dispatch(CommonActions.navigate('Admin'));
  const adminKey = nav.state.routes.at(-1).key;
  nav.dispatch(CommonActions.navigate('Dashboard'));
  const organizerKey = nav.state.routes.at(-1).key;
  nav.dispatch(StackActions.popTo('Admin'));
  assert.equal(nav.state.preloadedRoutes[0].key, organizerKey);
  nav.dispatch(CommonActions.navigate('Dashboard'));
  assert.equal(nav.state.routes.at(-1).key, organizerKey);
  nav.dispatch(StackActions.popTo('Tabs'));
  assert.equal(nav.state.preloadedRoutes.length, 2);
  assert.ok(nav.state.preloadedRoutes.some((route: any) => route.key === adminKey));
  assert.ok(nav.state.preloadedRoutes.some((route: any) => route.key === organizerKey));
});

test('ordinary user Profile preloads and retains its tab route across Home and Feed', () => {
  const router = TabRouter({ initialRouteName: 'Home' });
  const options = { routeNames: ['Home', 'Explore', 'Feed', 'Profile'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  state = router.getStateForAction(state, CommonActions.preload('Profile'), options);
  const key = state.routes.find((route: any) => route.name === 'Profile').key;
  assert.ok(state.preloadedRouteKeys.includes(key));
  for (const name of ['Profile', 'Home', 'Profile', 'Feed', 'Profile']) {
    state = router.getStateForAction(state, CommonActions.navigate(name), options);
    assert.equal(state.routes.find((route: any) => route.name === 'Profile').key, key);
    assert.equal(state.routes.length, 4);
  }
});
