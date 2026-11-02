import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';

function host(os = 'ios', role = 'user', ready = true) {
  const context = { bridge: { current: null as any } };
  const auth: { ready: boolean; user: { id: string; role: string } | null } = { ready, user: { id: 'account', role } };
  const preloads: string[] = [], preloadedRoutes: any[] = [];
  const refs: any[] = [], resets: any[] = [];
  let cursor = 0, navigationReady = true;
  let root: any;
  const navigation = { isReady: () => navigationReady, getRootState: () => { assert.ok(navigationReady, 'Root state is unavailable before navigator initialization'); return root; },
    preload: (name: string) => { preloads.push(name); preloadedRoutes.push({ name, key: name }); },
    dispatch: (action: any) => { resets.push(action); preloadedRoutes.splice(0, preloadedRoutes.length, ...action.payload.preloadedRoutes); root = action.payload; },
  };
  const deps: Record<string, any> = {
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
  const render = (name: string, accountScreen = 'ProfileHome', presentation?: string) => {
    const tabs = { name: 'Tabs', key: 'tabs', state: { type: 'tab', index: 3, routes: [
      { name: 'Home' }, { name: 'Explore' }, { name: 'Feed' },
      { name: 'Profile', state: { index: 0, routes: [{ name: accountScreen }] } },
    ] } };
    const routes = name === 'Tabs' ? [tabs] : [tabs, { name, key: name, params: { presentation } }];
    root = { index: routes.length - 1, routes, preloadedRoutes };
    cursor = 0;
    const tree = exports.MainTabBarProvider({ state: root, navigation, children: React.createElement('RootNavigator') });
    const nodes = elements(tree), host = nodes.find(element => element.props.testID === 'persistent-navbar-host');
    return { bars: nodes.filter(element => element.type === exports.MainTabBar), visible: host?.props.style.display === 'flex',
      select: nodes.find(element => element.type === 'MainContext').props.value.select,
      bridge: nodes.find(element => element.type === 'MainContext').props.value.bridge };
  };
  return { exports, context, render, auth, preloads, preloadedRoutes, resets, setNavigationReady: (value: boolean) => { navigationReady = value; } };
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
  const routes = ['Home', 'Explore', 'Feed', 'Profile'].map(name => ({ name }));
  let previous: any;
  for (const index of [0, 3, 1, 3, 2, 0, 3, 0]) {
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
