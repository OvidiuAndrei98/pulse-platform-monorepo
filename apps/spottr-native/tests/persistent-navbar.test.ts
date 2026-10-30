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
    'react-native-reanimated': { useSharedValue: (value: number) => ({ value }) },
    '../auth/AuthProvider': { useAuth: () => auth },
    './TabBar': {}, './useTabIndicator': { useTabIndicator: () => ({ value: 0 }) },
    './useNavbarScroll': { NavbarScrollContext: { Provider: 'ScrollContext' } },
    './profileStackRouter': { isProfileWorkspace: (name: string) => ['Dashboard', 'Admin'].includes(name) },
    './tabCapsuleSpring': { tabCapsuleSpring: {} },
    './tabSelectionQueue': { createTabSelectionQueue: () => ({ select() {}, clear() {} }) },
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
    return { bars: nodes.filter(element => element.type === exports.MainTabBar), visible: host?.props.style.display === 'flex' };
  };
  return { exports, context, render, auth, preloads, preloadedRoutes, resets, setNavigationReady: (value: boolean) => { navigationReady = value; } };
}

test('iOS uses one persistent navbar host across user, organizer and admin pages', () => {
  const ui = host();
  for (const name of ['Tabs', 'Dashboard', 'Admin', 'Scanner']) {
    assert.equal(ui.render(name).bars.length, 1, name + ' uses the same host');
    assert.equal(ui.render(name).visible, true);
    assert.equal(ui.exports.SceneMainTabBar(), null, 'A scene never creates a second iOS bar');
  }
  const props = { state: { index: 0, routes: [{ name: 'Home' }] } };
  assert.equal(ui.exports.MainTabBarRegistration(props), null);
  assert.equal(ui.context.bridge.current, props, 'The real tab event bridge remains registered');
});

test('Back pages hide the host, while a transparent native event presentation keeps it underneath', () => {
  const ui = host();
  for (const name of ['Search', 'Auth', 'Legal', 'Checkout', 'PublicProfile', 'SafetyGroup']) {
    assert.equal(ui.render(name).visible, false, name);
    assert.equal(ui.render(name).bars.length, 1, 'Hiding does not recreate the navbar');
  }
  for (const page of ['Tickets', 'Orders', 'SavedEvents']) assert.equal(ui.render('Tabs', page).visible, false, page);
  assert.equal(ui.render('Event', 'ProfileHome', 'page').visible, false);
  assert.equal(ui.render('Event', 'ProfileHome', 'sheet').visible, true);
  assert.equal(ui.render('Tabs').visible, true);
});

test('web and Android keep their scene navbars without adding an overlay host', () => {
  for (const os of ['web', 'android']) {
    const ui = host(os);
    assert.equal(ui.render('Dashboard').bars.length, 0);
    assert.equal(ui.exports.SceneMainTabBar().type, ui.exports.MainTabBar);
  }
});

test('iOS prepares organizer and admin workspaces when the session resolves without waiting for idle', () => {
  for (const [role, target] of [['organizer', 'Dashboard'], ['admin', 'Admin']]) {
    const ui = host('ios', role, false);
    ui.render('Tabs');
    assert.equal(ui.preloads.length, 0, 'The unverified role cannot preload a private workspace');
    ui.auth.ready = true;
    ui.render('Tabs');
    assert.deepEqual(ui.preloads, [target]);
    ui.render('Tabs');
    assert.equal(ui.preloads.length, 1, 'An already prepared workspace is reused');
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
  assert.deepEqual(ui.preloads, ['Admin']);
  assert.deepEqual(ui.preloadedRoutes.map(route => route.name), ['Admin'], 'The previous account workspace is removed first');
});
