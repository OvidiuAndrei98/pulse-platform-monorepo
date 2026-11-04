import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import { MAIN_TAB_NAMES, PROFILE_TAB_INDEX } from '@packages/app-core/navigation/mainTabs';

const nativeRequire = createRequire(require.resolve('@react-navigation/native/package.json'));
const coreRequire = createRequire(nativeRequire.resolve('@react-navigation/core/package.json'));
const { StackRouter, TabRouter, CommonActions, StackActions } = coreRequire('@react-navigation/routers');
const { getStateFromPath } = require(resolve(dirname(nativeRequire.resolve('@react-navigation/core/package.json')), 'lib/module/getStateFromPath.js'));
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

test('preloaded Search and pushed Notifications retain Home and never demote a native screen across repeated returns', () => {
  const original = StackRouter({ initialRouteName: 'Tabs' });
  const router = { ...original, ...exports.profileTabRouter(original) };
  const options = { routeNames: ['Tabs', 'Search', 'Notifications', 'PublicProfile', 'Tickets'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  const tabsKey = state.routes[0].key;
  const levels = (value: any) => new Map([...value.routes.map((route: any) => [route.key, 2]), ...value.preloadedRoutes.map((route: any) => [route.key, 0])]);
  const dispatch = (action: any) => {
    const before = levels(state);
    state = router.getStateForAction(state, action, options) ?? state;
    for (const [key, value] of levels(state)) assert.ok(!before.has(key) || before.get(key)! <= value!, 'Mounted native screens never change from active to preloaded');
    assert.equal(state.routes[0].key, tabsKey, 'The source page and its navbar survive');
  };
  for (let cycle = 0; cycle < 8; cycle++) {
    dispatch(CommonActions.preload('Search'));
    const searchKey = state.preloadedRoutes[0].key;
    dispatch(CommonActions.navigate('Notifications'));
    for (const destination of ['PublicProfile', 'Tickets']) {
      dispatch(CommonActions.navigate(destination, destination === 'PublicProfile' ? { id: 'friend' } : undefined));
      dispatch(CommonActions.goBack());
      assert.equal(state.routes.at(-1).name, 'Notifications');
    }
    dispatch(CommonActions.goBack());
    dispatch(CommonActions.navigate('Search'));
    assert.equal(state.routes.at(-1).key, searchKey, 'Search adopts the already prepared native screen');
    dispatch(CommonActions.goBack());
  }
});

test('iOS admin and organizer returns target the retained Profile tab instead of a root workspace', () => {
  const original = StackRouter({ initialRouteName: 'Tabs' });
  const router = { ...original, ...exports.profileTabRouter(original) };
  const options = { routeNames: ['Tabs', 'Dashboard', 'Admin', 'Auth', 'Search'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  const key = state.routes[0].key;
  for (const name of ['Admin', 'Dashboard']) for (const makeAction of [CommonActions.navigate, StackActions.popTo, StackActions.push, StackActions.replace]) {
    state = router.getStateForAction(state, CommonActions.navigate('Auth'), options);
    const params = { section: name === 'Admin' ? 'commissions' : 'events', filter: 'draft', eventId: 'event' };
    state = router.getStateForAction(state, makeAction(name, params), options);
    assert.deepEqual(state.routes.map((r: any) => r.name), ['Tabs']);
    assert.equal(state.routes[0].key, key, 'The original tab host and navbar survive');
    assert.equal(state.preloadedRoutes.length, 0, 'No second role workspace is mounted offscreen');
    assert.deepEqual(JSON.parse(JSON.stringify(state.routes[0].params)), {screen:'Profile',params:{screen:name,params}});
  }
  state = router.getStateForAction(state, CommonActions.navigate('Search'), options);
  assert.deepEqual(state.routes.map((r: any) => r.name), ['Tabs','Search'], 'Search remains a native push above the bar');
});

test('iOS workspace links keep their existing paths and parameters inside Profile', () => {
  const config = { screens: { Tabs: { screens: { Home: '', Profile: { screens: exports.nativeProfilePaths } } } } };
  for (const [path, name, params] of [
    ['admin?section=organizers&organizerId=account', 'Admin', {section:'organizers',organizerId:'account'}],
    ['dashboard/events?filter=completed', 'Dashboard', {section:'events',filter:'completed'}],
    ['dashboard/finance?organizerReturn=connect&returnStatus=complete', 'Dashboard', {section:'finance',organizerReturn:'connect',returnStatus:'complete'}],
    ['users/me', 'ProfileHome', undefined], ['profile', 'ProfileHome', undefined],
  ] as const) {
    const state = getStateFromPath(path, config);
    assert.equal(state.routes[0].name, 'Tabs');
    assert.equal(state.routes[0].state.routes[0].name, 'Profile');
    const route = state.routes[0].state.routes[0].state.routes[0];
    assert.equal(route.name, name); assert.deepEqual(route.params, params);
  }
  assert.equal(exports.profileHomeScreen('admin'), 'Admin');
  assert.equal(exports.profileHomeScreen('organizer'), 'Dashboard');
  assert.equal(exports.profileHomeScreen('user'), 'ProfileHome');
});

test('Dashboard events filters then Home never demotes a mounted native-stack screen', () => {
  const nav = stack();
  // NativeStackView uses activityState=2 for routes and 0 for preloadedRoutes.
  // InnerScreen rejects 2 -> 0 for the same mounted route key.
  const activity = (state: any): Map<string, number> => new Map([
    ...state.routes.map((route: any) => [route.key, 2] as const),
    ...state.preloadedRoutes.map((route: any) => [route.key, 0] as const),
  ]);
  let previous = activity(nav.state);
  const dispatch = (action: any) => {
    nav.dispatch(action);
    const next = activity(nav.state);
    for (const [key, value] of next) {
      assert.ok(!previous.has(key) || previous.get(key)! <= value, '[RNScreens] activityState cannot be decreased in NativeStack');
    }
    previous = next;
  };
  for (let cycle = 0; cycle < 12; cycle++) {
    dispatch(CommonActions.preload('Dashboard', { section: 'events' }));
    dispatch(CommonActions.navigate('Dashboard', { section: 'events' }));
    for (const filter of ['draft', 'completed', 'published']) dispatch(CommonActions.setParams({ filter }));
    dispatch(StackActions.popTo('Tabs', { screen: 'Home' }));
  }
});

for (const role of ['Dashboard', 'Admin']) test(`${role} preserves Tabs and prepares a fresh native screen through repeated navbar returns`, () => {
  const nav = stack(), tabsKey = nav.state.routes[0].key;
  nav.dispatch(CommonActions.navigate(role, { section: 'profile' }));
  let profileKey = nav.state.routes.at(-1).key;
  for (let index = 0; index < 10; index++) {
    nav.dispatch(StackActions.popTo('Tabs', { screen: index % 2 ? 'Feed' : 'Home' }));
    assert.equal(nav.state.routes[0].key, tabsKey, 'The original tab navigator survives');
    assert.equal(nav.state.preloadedRoutes.length, 1);
    assert.notEqual(nav.state.preloadedRoutes[0].key, profileKey, 'A visited native screen is never demoted to preloaded');
    profileKey = nav.state.preloadedRoutes[0].key;
    assert.equal(nav.state.preloadedRoutes[0].params.section, 'profile');
    nav.dispatch(CommonActions.navigate(role, nav.state.preloadedRoutes[0].params));
    assert.equal(nav.state.routes.at(-1).key, profileKey, 'Re-entry adopts the existing native screen');
    assert.equal(nav.state.preloadedRoutes.length, 0);
  }
});

test('leaving a workspace drops transient pages and prepares a new workspace instance', () => {
  const nav = stack();
  nav.dispatch(CommonActions.navigate('Dashboard'));
  const key = nav.state.routes.at(-1).key;
  nav.dispatch(CommonActions.navigate('Event', { id: 'event' }));
  nav.dispatch(StackActions.popTo('Tabs', { screen: 'Home' }));
  assert.deepEqual(nav.state.routes.map((route: any) => route.name), ['Tabs']);
  assert.equal(nav.state.preloadedRoutes.length, 1);
  assert.notEqual(nav.state.preloadedRoutes[0].key, key);
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

test('an administrator can switch workspaces without reusing a dismissed native screen', () => {
  const nav = stack();
  nav.dispatch(CommonActions.navigate('Admin'));
  const adminKey = nav.state.routes.at(-1).key;
  nav.dispatch(CommonActions.navigate('Dashboard'));
  const organizerKey = nav.state.routes.at(-1).key;
  nav.dispatch(StackActions.popTo('Admin'));
  assert.notEqual(nav.state.preloadedRoutes[0].key, organizerKey);
  const preparedOrganizerKey = nav.state.preloadedRoutes[0].key;
  nav.dispatch(CommonActions.navigate('Dashboard'));
  assert.equal(nav.state.routes.at(-1).key, preparedOrganizerKey);
  nav.dispatch(StackActions.popTo('Tabs'));
  assert.equal(nav.state.preloadedRoutes.length, 2);
  assert.ok(nav.state.preloadedRoutes.some((route: any) => route.name === 'Admin' && route.key !== adminKey));
  assert.ok(nav.state.preloadedRoutes.some((route: any) => route.name === 'Dashboard' && route.key !== preparedOrganizerKey));
});

test('ordinary user Profile preloads and retains its tab route across Home and Feed', () => {
  const router = TabRouter({ initialRouteName: 'Home' });
  const options = { routeNames: [...MAIN_TAB_NAMES], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  state = router.getStateForAction(state, CommonActions.preload('Profile'), options);
  const key = state.routes.find((route: any) => route.name === 'Profile').key;
  assert.ok(state.preloadedRouteKeys.includes(key));
  for (const name of ['Profile', 'Home', 'Profile', 'Feed', 'Profile']) {
    state = router.getStateForAction(state, CommonActions.navigate(name), options);
    assert.equal(state.routes.find((route: any) => route.name === 'Profile').key, key);
    assert.equal(state.routes.length, MAIN_TAB_NAMES.length);
  }
});

test('changing account resets the Profile route, including nested admin state, without remounting the tab navigator', () => {
  // Use the actual Screen props, then let React Navigation's router process the
  // navigationKey change. A React key on Profile.Navigator alone fails this.
  const source = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const code = ast.statements.filter(node => ts.isFunctionDeclaration(node)
    && ['MainTabs', 'NativeProfileNavigator'].includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n');
  const ui: any = {};
  let user: { id: string; role: string } | null = { id: 'admin-account', role: 'admin' };
  runInNewContext(ts.transpileModule(code + '\nexport {MainTabs, NativeProfileNavigator};', {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: ui, React, useAuth: () => ({user, ready:true}), usePreferences: () => ({t:(key:string)=>key}),
    profileHomeScreen: exports.profileHomeScreen, Platform: { OS: 'ios' }, colors: { bg: '#000' },
    Tabs: {Navigator:'Tabs', Screen:'Screen'}, Profile: {Navigator:'Profile', Screen:'Screen'},
    PersistentTabScenes:'PersistentTabScenes', MainTabBarRegistration:'Bar', Home:'Home', Explore:'Explore',
    FriendsNavigator:'Friends', EventFeedScreen:'Feed', ProfileNavigator:'Profile', StableProfileScreen:'ProfileHome', ProfileScreen:'ProfileHome', ProfileDashboardRoute:'Dashboard', ProfileAdminRoute:'Admin' });
  const screen = () => ui.MainTabs().props.children.props.children.find((element: any) => element.props.name === 'Profile');
  const router = TabRouter({ initialRouteName: 'Home' });
  const options = {routeNames:[...MAIN_TAB_NAMES],routeParamList:{},routeGetIdList:{}};
  let state = router.getInitialState(options), previousKey = screen().props.navigationKey;
  const hostKey = state.key, otherTabs = state.routes.slice(0,PROFILE_TAB_INDEX);
  for (const next of [null, {id:'basic-account',role:'user'}, {id:'organizer-account',role:'organizer'},
    {id:'admin-account',role:'admin'}, {id:'another-admin',role:'admin'}, {id:'another-admin',role:'user'}]) {
    const previousProfileKey = state.routes[PROFILE_TAB_INDEX].key;
    state.routes[PROFILE_TAB_INDEX] = {...state.routes[PROFILE_TAB_INDEX],params:{screen:'Admin',params:{section:'commissions'}},
      state:{index:0,routes:[{key:'old-private-route',name:'Admin'}]}};
    user = next;
    const navigationKey = screen().props.navigationKey;
    assert.notEqual(navigationKey, previousKey, 'Different identities and roles invalidate private navigation');
    state = router.getStateForRouteNamesChange(state, {...options,routeKeyChanges:navigationKey !== previousKey ? ['Profile'] : []});
    assert.equal(state.key,hostKey,'The navbar keeps its original navigator');
    assert.deepEqual(state.routes.slice(0,PROFILE_TAB_INDEX),otherTabs,'The other tabs keep their state');
    assert.notEqual(state.routes[PROFILE_TAB_INDEX].key,previousProfileKey);
    assert.equal(state.routes[PROFILE_TAB_INDEX].state,undefined,'No nested Admin screen survives');
    assert.equal(state.routes[PROFILE_TAB_INDEX].params,undefined,'No old params can reopen Admin');
    assert.equal(ui.NativeProfileNavigator().props.initialRouteName,exports.profileHomeScreen(next?.role));
    assert.equal(screen().props.navigationKey,navigationKey,'Ordinary renders retain this account workspace');
    assert.equal(ui.MainTabs().props.children.key,null,'The full tab navigator is not keyed by account');
    previousKey = navigationKey;
  }
});
