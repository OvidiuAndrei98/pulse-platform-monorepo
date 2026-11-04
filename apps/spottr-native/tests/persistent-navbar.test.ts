import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import * as mainTabs from '@packages/app-core/navigation/mainTabs';

function host(os = 'ios', role = 'user', ready = true) {
  const context = { bridge: { current: null as any } };
  const auth: { ready: boolean; user: { id: string; role: string } | null } = { ready, user: { id: 'account', role } };
  const preloads: string[] = [], preloadedRoutes: any[] = [];
  const refs: any[] = [], resets: any[] = [], navigations: any[] = [];
  let cursor = 0, navigationReady = true;
  let root: any;
  const navigation = { isReady: () => navigationReady, getRootState: () => { assert.ok(navigationReady, 'Root state is unavailable before navigator initialization'); return root; },
    navigate: (...args: any[]) => navigations.push(args),
    preload: (name: string) => { preloads.push(name); preloadedRoutes.push({ name, key: name }); },
    dispatch: (action: any) => { resets.push(action); preloadedRoutes.splice(0, preloadedRoutes.length, ...action.payload.preloadedRoutes); root = action.payload; },
  };
  const deps: Record<string, any> = {
    '@packages/app-core/navigation/mainTabs': mainTabs,
    react: { ...React, createContext: () => ({ Provider: 'MainContext' }), useContext: () => context,
      useRef: (value: any) => refs[cursor++] ??= { current: value }, useState: (value: any) => [value, () => {}],
      useEffect() {}, useLayoutEffect: (effect: () => void) => { effect(); },
      useCallback: (callback: any) => callback, useMemo: (factory: () => any) => factory(),
    },
    'react-native': { Platform: { OS: os }, View: 'View' },
    '@react-navigation/native': { getFocusedRouteNameFromRoute: (route: any) => route.state?.routes[route.state.index]?.name,
      CommonActions: { reset: (state: any) => ({ type: 'RESET', payload: state }) },
    },
    'react-native-safe-area-context': {},
    'react-native-reanimated': { useSharedValue: (value: number) => ({ value }), runOnUI: (fn: any) => fn },
    '../auth/AuthProvider': { useAuth: () => auth },
    './TabBar': {}, './useTabIndicator': { useTabIndicator: () => ({ value: 0 }) },
    './useNavbarScroll': { NavbarScrollContext: { Provider: 'ScrollContext' } },
    './profileStackRouter': { isProfileWorkspace: (name: string) => ['Dashboard', 'Admin'].includes(name),
      profileHomeScreen: (role: string) => role === 'admin' ? 'Admin' : role === 'organizer' ? 'Dashboard' : 'ProfileHome' },
    './tabCapsuleSpring': { withTabTravel: (target: number) => target },
    './tabSelectionQueue': { createTabCommitScheduler: () => ({ schedule() { return 0; }, cancel() {} }), createTabSelectionQueue: () => ({ select() {}, clear() {} }) },
  };
  const exports: any = {};
  runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation/MainTabBar.tsx'), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  const elements = (node: any): any[] => Array.isArray(node) ? node.flatMap(elements) : React.isValidElement(node) ? [node, ...elements((node.props as any).children)] : [];
  const render = (name: string, accountScreen = 'ProfileHome', presentation?: string, tabIndex = 4, params = {}) => {
    const tabs = { name: 'Tabs', key: 'tabs', state: { type: 'tab', index: tabIndex, routes: [
      { name: 'Home' }, { name: 'Explore' }, { name: 'Friends' }, { name: 'Feed' },
      { name: 'Profile', state: { index: 0, routes: [{ name: accountScreen }] } },
    ] } };
    const routes = name === 'Tabs' ? [tabs] : [tabs, { name, key: name, params: { presentation, ...params } }];
    root = { index: routes.length - 1, routes, preloadedRoutes };
    cursor = 0;
    const tree = exports.MainTabBarProvider({ state: root, navigation, children: React.createElement('RootNavigator') });
    const nodes = elements(tree), host = nodes.find(element => element.props.testID === 'persistent-navbar-host');
    return { bars: nodes.filter(element => element.type === exports.MainTabBar), visible: host?.props.style.display === 'flex',
      activeIndex: nodes.find(element => element.type === 'MainContext').props.value.activeIndex,
      select: nodes.find(element => element.type === 'MainContext').props.value.select,
      bridge: nodes.find(element => element.type === 'MainContext').props.value.bridge };
  };
  return { exports, context, render, auth, preloads, preloadedRoutes, resets, navigations, setNavigationReady: (value: boolean) => { navigationReady = value; } };
}

test('iOS keeps shared navbar state outside scenes without drawing over the native stack', () => {
  const ui = host();
  for (const name of ['Tabs', 'Dashboard', 'Admin', 'Scanner']) {
    assert.equal(ui.render(name).bars.length, 0, name + ' has no window-level bar');
    assert.equal(ui.exports.SceneMainTabBar().type, ui.exports.MainTabBar, 'Each workspace carries its bar underneath pushed pages');
  }
  const props = { state: { index: 0, routes: [{ name: 'Home' }] } };
  const scene = ui.exports.MainTabBarRegistration(props);
  assert.equal(scene.props.testID, 'tabs-navbar-host');
  assert.equal(scene.props.style.display, 'flex');
  assert.equal(scene.props.children.type, ui.exports.MainTabBar);
  assert.equal(ui.context.bridge.current, props, 'The real tab event bridge remains registered');
});

test('Search and account pages keep the one source navbar beneath the root stack', () => {
  const ui = host();
  const props = { state: { index: 0, routes: [{ name: 'Home' }] } };
  for (const name of ['Tabs', 'Search', 'Tickets', 'Orders', 'SavedEvents', 'Auth', 'Legal', 'Checkout', 'PublicProfile', 'SafetyGroup', 'Tabs']) {
    assert.equal(ui.render(name).bars.length, 0, 'Foreground pages have no global bar');
    const scene = ui.exports.MainTabBarRegistration(props);
    assert.equal(scene.props.style.display, 'flex', name + ' retains the source bar throughout its native transition');
  }
  const profile = ui.exports.MainTabBarRegistration({ state: { index: 0, routes: [{ name: 'Profile' }] } });
  assert.equal(profile.props.style.display, 'flex');
  assert.equal(profile.props.children.type, ui.exports.MainTabBar);
});

test('rapid visits to Profile keep the same visible tab host and gesture surface', () => {
  const ui = host();
  const routes = mainTabs.MAIN_TAB_NAMES.map(name => ({ name }));
  let previous: any;
  for (const index of [0, 4, 1, 4, 2, 3, 0, 4, 0]) {
    const scene = ui.exports.MainTabBarRegistration({ state: { index, routes } });
    assert.equal(scene.props.style.display, 'flex');
    assert.notEqual(scene.props.children.props.interactionEnabled, false);
    if (previous) {
      assert.equal(scene.type, previous.type);
      assert.equal(scene.key, previous.key);
      assert.equal(scene.props.children.type, previous.props.children.type);
    }
    previous = scene;
  }
});

test('role workspaces highlight Profile at index four, independently of Feed', () => {
  for (const role of ['user', 'admin', 'organizer']) {
    const ui = host('ios', role);
    for (const page of ['Tabs', 'Dashboard', 'Admin', 'Scanner']) assert.equal(ui.render(page).activeIndex, mainTabs.PROFILE_TAB_INDEX);
  }
});

test('web and Android keep their scene navbars without adding an overlay host', () => {
  for (const os of ['web', 'android']) {
    const ui = host(os);
    assert.equal(ui.render('Dashboard').bars.length, 0);
    assert.equal(ui.exports.SceneMainTabBar().type, ui.exports.MainTabBar);
  }
});

test('iOS uses the existing Profile tab for role workspaces without preloading a second root screen', () => {
  for (const [role, target] of [['organizer', 'Dashboard'], ['admin', 'Admin']]) {
    const ui = host('ios', role, false);
    ui.render('Tabs');
    assert.equal(ui.preloads.length, 0, 'The unverified role cannot preload a private workspace');
    ui.auth.ready = true;
    ui.render('Tabs');
    assert.deepEqual(ui.preloads, []);
    ui.render('Tabs');
    assert.equal(ui.preloads.length, 0, 'The tab owns the workspace');
    const state = { index: 0, routes: [
      { name: 'Home', key: 'home' },
      { name: 'Profile', key: 'profile', state: { index: 0, routes: [{ name: target }] } },
    ] };
    const commands: any[] = [];
    ui.render('Tabs', target).bridge.current = { navigation: { getState: () => state, emit: () => ({defaultPrevented:false}),
      navigate: (...args: any[]) => commands.push(args) } };
    for (let i = 0; i < 10; i++) ui.render('Tabs', target).select('Profile');
    assert.equal(commands.length, 10, 'Rapid role-profile presses use the real tab event path');
    assert.ok(commands.every(args => args[0] === 'Profile'));
    assert.equal(ui.resets.length, 0, 'No native-stack replacement or preload is involved');
  }
});

test('session hydration before navigator initialization waits before clearing and preparing a role workspace', () => {
  const ui = host('ios', 'admin', false);
  ui.auth.user = null;
  ui.setNavigationReady(false);
  ui.preloadedRoutes.push({ name: 'Dashboard', key: 'previous-account-workspace' });
  ui.render('Tabs');
  ui.auth.ready = true;
  ui.auth.user = { id: 'new-account', role: 'admin' };
  ui.render('Tabs');
  assert.equal(ui.preloads.length, 0);
  assert.equal(ui.resets.length, 0);
  ui.setNavigationReady(true);
  ui.render('Tabs');
  assert.equal(ui.resets.length, 1);
  assert.deepEqual(ui.preloads, []);
  assert.deepEqual(ui.preloadedRoutes, [], 'The previous account workspace is removed, without mounting a duplicate');
});

test('after logout iOS Profile opens Auth once without committing a guest Profile tab first', () => {
  const ui = host();
  ui.auth.user = null;
  const page = ui.render('Tabs', 'ProfileHome', undefined, 0);
  const tabCommands: any[] = [], events: any[] = [];
  page.bridge.current = { navigation: {
    getState: () => ({ index: 0, routes: mainTabs.MAIN_TAB_NAMES.map(name => ({ name, key: name })) }),
    emit: (event: any) => { events.push(event); return { defaultPrevented: false }; },
    navigate: (...args: any[]) => tabCommands.push(args),
  } };
  assert.equal(page.select('Profile'), true);
  assert.equal(events.length, 1, 'The real tabPress event is preserved');
  assert.equal(tabCommands.length, 0, 'No intermediate Profile scene mounts during travel');
  assert.equal(ui.navigations.length, 1);
  assert.equal(ui.navigations[0][0], 'Auth');
  assert.equal(ui.navigations[0][1].returnTab, 'Profile');
  assert.equal(ui.render('Auth', 'ProfileHome', undefined, 0, { returnTab: 'Profile' }).activeIndex, mainTabs.PROFILE_TAB_INDEX,
    'The root Auth acknowledgement keeps the selected indicator destination');
  assert.equal(ui.render('Tabs', 'ProfileHome', undefined, 0).activeIndex, 0, 'Closing Auth restores the underlying Home selection');
});

test('guest Profile respects prevented selections and waits for verified session hydration', () => {
  const ui = host(); ui.auth.user = null;
  const page = ui.render('Tabs', 'ProfileHome', undefined, 0);
  page.bridge.current = { navigation: {
    getState: () => ({ index: 0, routes: mainTabs.MAIN_TAB_NAMES.map(name => ({ name, key: name })) }),
    emit: () => ({ defaultPrevented: true }), navigate: () => { throw Error('A prevented tab cannot navigate'); },
  } };
  assert.equal(page.select('Profile'), false);
  assert.equal(ui.navigations.length, 0);
  ui.auth.ready = false;
  assert.equal(ui.render('Tabs').select('Profile'), true);
  assert.equal(ui.navigations.length, 0, 'A not-yet-restored organizer cannot be mistaken for a guest');
});
