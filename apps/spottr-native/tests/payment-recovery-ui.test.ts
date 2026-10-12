import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import React from 'react';
import ts from 'typescript';
import * as payments from '../src/checkout/nativePayment';
import { createPaymentRecoveryStore } from '../src/checkout/paymentRecoveryStore';
import { checkPaymentConfirmation } from '../../pulse-app/src/features/checkout/confirmation';
import { isEventId } from '../src/data/events';

const account = '11111111-1111-4111-8111-111111111111';
const otherAccount = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';
const orderId = '44444444-4444-4444-8444-444444444444';
const session: payments.NativePaymentSession = { mode: 'payment_sheet', orderId, paymentIntentId: 'pi_ui', paymentIntentClientSecret: 'pi_ui_secret_private', stripeAccountId: 'acct_ui', publishableKey: 'pk_test_ui', expiresAt: '2099-01-01T00:00:00Z' };
const elements = (node: any): any[] => Array.isArray(node) ? node.flatMap(elements) : React.isValidElement(node) ? [node, ...elements((node.props as any).children)] : [];

// Execute real screen JSX and effects without replacing recovery/payment logic.
// Only React scheduling and native views/navigation are simulated here.
function mount(file: string, name: string, props: any, dependencies: Record<string, any>) {
  let index = 0, dirty = true, tree: any;
  const slots: any[] = [], effects: (() => void)[] = [];
  const react = {
    ...React,
    useRef: (value: any) => { const i = index++; return slots[i] ??= { current: value }; },
    useState: (initial: any) => {
      const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value: any) => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }];
    },
    useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const i = index++, previous = slots[i];
      if (previous && deps.every((value, n) => Object.is(value, previous.deps[n]))) return;
      effects.push(() => { previous?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    },
  };
  const exports: any = {};
  const deps: Record<string, any> = { react: { __esModule: true, default: react, ...react }, ...dependencies };
  const js = ts.transpileModule(readFileSync(resolve(__dirname, '../src', file), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(js, { exports, require: (id: string) => { if (!(id in deps)) throw Error('Unexpected dependency: ' + id); return deps[id]; }, Date });
  return {
    setProps(next: any) { props = next; dirty = true; },
    render() { dirty = true; },
    async flush() {
      for (let i = 0; i < 16; i++) {
        if (dirty) { dirty = false; index = 0; tree = exports[name](props); while (effects.length) effects.shift()!(); }
        await new Promise(resolve => setImmediate(resolve));
      }
    },
    tree: () => tree,
    find: (id: string) => elements(tree).find(el => el.props.testID === id),
    text: (value: string) => elements(tree).some(el => el.props.children === value),
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

async function fixture() {
  const disk = new Map<string, string>();
  const store = createPaymentRecoveryStore({ getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value); }, removeItem: async key => { disk.delete(key); } }, 'ui-test');
  await store.save({ session, eventId, accountId: account, cancelRequested: false });
  payments.clearNativePayments(); payments.configureNativePaymentRecovery(store);
  const auth = { ready: true, user: { id: account }, token: 'token-A' };
  const controller = { getToken: () => auth.token };
  const calls: any[] = [], requests: string[] = [], subscriptions = new Set<(state: string) => void>();
  let server: 'pending' | 'completed' | 'failed' | 'offline' = 'pending', navReady = true;
  let current: any = { name: 'Home' };
  const navigation = {
    isReady: () => navReady, getCurrentRoute: () => current,
    navigate: (...args: any[]) => { calls.push(args); }, popTo: (...args: any[]) => { calls.push(args); },
    getState: () => ({ routes: [{ name: 'Tabs' }, { name: 'CheckoutReturn' }], index: 1 }),
  };
  const prefs = { copy: (key: string) => key };
  const deps = {
    'react-native': { Platform: { OS: 'ios' }, View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: (v: any) => v }, AppState: { addEventListener: (_: string, fn: (state: string) => void) => { subscriptions.add(fn); return { remove: () => subscriptions.delete(fn) }; } } },
    '@react-navigation/native': { useIsFocused: () => true },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 60, bottom: 34 }) },
    'lucide-react-native': { AlertCircle: 'Alert', CheckCircle2: 'Success', Mail: 'Mail', Ticket: 'Ticket', UserRoundPlus: 'Account' },
    '../auth/AuthProvider': { useAuth: () => ({ ...auth, controller }), accountApi: async (path: string) => { requests.push(path); if (server === 'offline') throw Error('offline'); return { orderId, status: server }; } },
    '../PreferencesProvider': { usePreferences: () => prefs },
    '../data/queries': { queryClient: { invalidateQueries() {} } },
    '../data/events': { isEventId },
    '../ui/Text': { Text: 'Text' }, '../ui/theme': { colors: {} }, '../ui/haptics': { haptic() {} },
    '../ui/common': { Feedback: 'Feedback' },
    './paymentRecoveryStorage': {}, '../checkout/paymentRecoveryStorage': {},
    './nativePayment': payments, '../checkout/nativePayment': payments,
    '../navigation/returnToEvent': { returnToEvent: (...args: unknown[]) => calls.push(args) },
    '../../../pulse-app/src/features/checkout/confirmation': { checkPaymentConfirmation: (read: any, active: any) => checkPaymentConfirmation(read, active, async () => {}) },
    '../../../pulse-app/src/features/checkout/nativeReturn': { validCheckoutSession: () => true },
  };
  return { store, auth, deps, navigation, calls, requests, subscriptions,
    server: (value: typeof server) => { server = value; }, ready: (value: boolean) => { navReady = value; }, route: (value: any) => { current = value; } };
}
const tabs = () => ({ index: 0, routes: [{ name: 'Tabs' }] });

test('cold startup waits for auth/navigation, opens confirmation once and never includes payment secrets in routes', async () => {
  const f = await fixture(); f.auth.ready = false; f.ready(false);
  const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
  await ui.flush(); assert.equal(f.calls.length, 0);
  f.auth.ready = true; ui.render(); await ui.flush(); assert.equal(f.calls.length, 0);
  f.ready(true); ui.setProps({ navigation: f.navigation, state: tabs() }); await ui.flush();
  assert.equal(f.calls.length, 1);
  assert.equal(JSON.stringify(f.calls[0]), JSON.stringify(['CheckoutReturn', { eventId, nativeOrderId: orderId }]));
  assert.doesNotMatch(JSON.stringify(f.calls), /secret|token-A|pk_test|acct_/);
  ui.setProps({ navigation: f.navigation, state: tabs() }); await ui.flush();
  assert.equal(f.calls.length, 1, 'Leaving pending confirmation must not reopen it immediately');
  ui.unmount();
});

test('startup recovery defers to event links and records confirmation already opened in a nested checkout', async () => {
  const f = await fixture();
  const state = { index: 1, routes: [{ name: 'Tabs' }, { name: 'Event' }] };
  const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state }, f.deps);
  await ui.flush(); assert.equal(f.calls.length, 0);
  f.route({ name: 'CheckoutReturn', params: { eventId, nativeOrderId: orderId } });
  ui.setProps({ navigation: f.navigation, state: { ...state } }); await ui.flush();
  f.route({ name: 'Home' }); ui.setProps({ navigation: f.navigation, state: tabs() }); await ui.flush();
  assert.equal(f.calls.length, 0, 'Returning from nested confirmation must not push another copy');
  ui.unmount();
});

test('restored confirmation shows pending, rechecks on foreground and acknowledges only server-confirmed success', async () => {
  const f = await fixture();
  const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
  await ui.flush();
  assert.ok(ui.text('feedback.confirmationPending'));
  assert.ok(ui.find('checkout-recheck')); assert.equal(ui.find('checkout-view-tickets'), undefined);
  assert.equal(f.requests.length, 4);
  f.server('completed'); f.subscriptions.forEach(fn => fn('active')); await ui.flush();
  assert.ok(ui.text('checkoutSuccess.confirmed')); assert.ok(ui.find('checkout-view-tickets'));
  ui.find('checkout-view-tickets').props.onPress(); await ui.flush();
  assert.deepEqual(await f.store.load(account), []);
  assert.equal(f.calls[0][0], 'Tabs');
  ui.unmount();
});

test('offline recovery stays retryable and the cancel action is verified by the server', async () => {
  const f = await fixture(); f.server('offline');
  const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
  await ui.flush(); assert.ok(ui.text('feedback.confirmationUnavailable'));
  assert.equal((await f.store.load(account)).length, 1);
  f.server('failed'); ui.find('checkout-cancel-attempt').props.onPress(); await ui.flush();
  assert.ok(f.requests.at(-1)?.endsWith('/cancel')); assert.ok(ui.text('checkout.paymentClosed'));
  ui.find('checkout-return-to-event').props.onPress(); await ui.flush();
  assert.deepEqual(await f.store.load(account), []);
  ui.unmount();
});

test('another account cannot verify the previous account order through a restored route', async () => {
  const f = await fixture(); f.auth.user.id = otherAccount; f.auth.token = 'token-B';
  const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
  await ui.flush();
  assert.ok(ui.text('feedback.confirmationInvalid')); assert.deepEqual(f.requests, []);
  assert.equal((await f.store.load(account)).length, 1);
  ui.unmount();
});

test('native Back retains pending recovery but acknowledges a confirmed result', async () => {
  for (const server of ['pending', 'completed'] as const) {
    const f = await fixture(); f.server(server);
    const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
    await ui.flush(); ui.unmount();
    assert.equal((await f.store.load(account)).length, server === 'pending' ? 1 : 0);
  }
});
