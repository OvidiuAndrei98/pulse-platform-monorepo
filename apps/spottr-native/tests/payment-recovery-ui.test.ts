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
import { confirmPayment, canRecheckPayment, canRestartCheckout } from '../src/checkout/confirmation';
import { ApiError } from '../src/data/http';
import { purchaseCompletion } from '../src/checkout/purchaseCompletion';

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
  runInNewContext(js, { exports, require: (id: string) => { if (!(id in deps)) throw Error('Unexpected dependency: ' + id); return deps[id]; }, Date: dependencies.__clock ?? Date });
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
  purchaseCompletion.clear();
  const disk = new Map<string, string>();
  const store = createPaymentRecoveryStore({ getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value); }, removeItem: async key => { disk.delete(key); } }, 'ui-test');
  await store.save({ session, eventId, accountId: account, cancelRequested: false });
  payments.clearNativePayments(); payments.configureNativePaymentRecovery(store);
  const auth = { ready: true, user: { id: account }, token: 'token-A' };
  const controller = { getToken: () => auth.token };
  const calls: any[] = [], requests: string[] = [], haptics: string[] = [], invalidations: string[] = [], subscriptions = new Set<(state: string) => void>();
  let server: 'pending' | 'completed' | 'failed' | 'refunded' | 'missing' | 'offline' | 'malformed' = 'pending', navReady = true;
  let now = Date.now(), gate: Promise<void> | undefined;
  const requestedOrders: string[] = [];
  let current: any = { name: 'Home' };
  const navigation = {
    isReady: () => navReady, getCurrentRoute: () => current,
    navigate: (...args: any[]) => { calls.push(args); }, popTo: (...args: any[]) => { calls.push(args); },
    getState: () => ({ routes: [{ name: 'Tabs' }, { name: 'CheckoutReturn' }], index: 1 }),
  };
  const prefs = { copy: (key: string) => key };
  const deps = {
    __clock: class extends Date { static now() { return now; } },
    'react-native': { Platform: { OS: 'ios' }, View: 'View', ScrollView: 'ScrollView', Pressable: 'Pressable', ActivityIndicator: 'Spinner', StyleSheet: { create: (v: any) => v }, AppState: { currentState: 'active', addEventListener: (_: string, fn: (state: string) => void) => { subscriptions.add(fn); return { remove: () => subscriptions.delete(fn) }; } } },
    '@react-navigation/native': { useIsFocused: () => true },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 60, bottom: 34 }) },
    'lucide-react-native': { AlertCircle: 'Alert', CheckCircle2: 'Success', Mail: 'Mail', Ticket: 'Ticket', UserRoundPlus: 'Account', ArrowLeft: 'Back', ArrowRight: 'Next', Clock3: 'Clock', RotateCcw: 'Retry', WifiOff: 'Offline' },
    '../auth/AuthProvider': { useAuth: () => ({ ...auth, controller }), accountApi: async (path: string, options: any) => {
      requests.push(path); requestedOrders.push(options?.body?.orderId ?? orderId);
      if (gate) await gate;
      if (server === 'offline') throw Error('offline');
      if (server === 'missing') throw new ApiError(404, 'NOT_FOUND');
      if (server === 'malformed') return { status: 'completed' };
      return { orderId: options?.body?.orderId ?? orderId, status: server };
    } },
    '../PreferencesProvider': { usePreferences: () => prefs },
    '../data/queries': { queryClient: { invalidateQueries({ queryKey }: { queryKey: string[] }) { invalidations.push(queryKey[0]!); } } },
    '../data/events': { isEventId },
    '../ui/Text': { Text: 'Text' }, '../ui/theme': { colors: {} }, '../ui/haptics': { haptic(kind: string) { haptics.push(kind); } },
    '../ui/MotionPressable': { MotionPressable: 'Pressable' },
    '../ui/GlassPressable': { GlassPressable: 'Pressable' },
    '../ui/ActionIcon': { ActionIcon: 'Pressable' },
    '../checkout/CheckoutSuccess': { CheckoutSuccessTicket: 'TicketSummary', PaymentSuccessCheck: 'SuccessCheck' },
    '../checkout/purchaseCompletion': { purchaseCompletion },
    './purchaseCompletion': { purchaseCompletion },
    '../checkout/paymentBrowser': { canResumePaymentBrowser: () => false, forgetPaymentBrowser() {} },
    '../checkout/confirmation': { canRecheckPayment, canRestartCheckout, confirmPayment: (read: any, active: any, _pause: any, attempts: 1 | 4) => confirmPayment(read, active, async () => {}, attempts) },
    '../ui/common': { Feedback: 'Feedback' },
    './paymentRecoveryStorage': {}, '../checkout/paymentRecoveryStorage': {},
    './nativePayment': payments, '../checkout/nativePayment': payments,
    '../navigation/returnToEvent': { returnToEvent: (...args: unknown[]) => calls.push(args) },
    '../../../pulse-app/src/features/checkout/confirmation': { checkPaymentConfirmation: (read: any, active: any) => checkPaymentConfirmation(read, active, async () => {}) },
    '../../../pulse-app/src/features/checkout/nativeReturn': { validCheckoutSession: () => true },
  };
  return { store, auth, deps, navigation, calls, requests, requestedOrders, subscriptions, haptics, invalidations,
    advance: (ms: number) => { now += ms; }, gate: (value: Promise<void> | undefined) => { gate = value; },
    appState: (state: string) => { deps['react-native'].AppState.currentState = state; subscriptions.forEach(fn => fn(state)); },
    server: (value: typeof server) => { server = value; }, ready: (value: boolean) => { navReady = value; }, route: (value: any) => { current = value; } };
}
const tabs = () => ({ index: 0, routes: [{ name: 'Tabs' }] });

test('abandoned PaymentSheet stays silent after startup, foreground and another cold restart', async () => {
  const f = await fixture(); f.auth.ready = false; f.ready(false);
  const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
  await ui.flush(); assert.equal(f.calls.length, 0);
  f.auth.ready = true; ui.render(); await ui.flush(); assert.equal(f.calls.length, 0);
  f.ready(true); ui.setProps({ navigation: f.navigation, state: tabs() }); await ui.flush();
  assert.equal(f.requests.length, 1); assert.deepEqual(f.calls, []); assert.equal(ui.tree(), null);
  assert.equal(payments.getPendingNativePayment(eventId, 'token-A')?.session.orderId, orderId);
  assert.ok(f.requests.every(path => path.endsWith('/reconcile')), 'No cancellation just because the app was killed');
  f.appState('background'); f.appState('active'); await ui.flush();
  ui.setProps({ navigation: f.navigation, state: tabs() }); await ui.flush();
  assert.equal(f.requests.length, 1, 'Rapid navigation and foreground do not poll repeatedly');
  assert.deepEqual(f.calls, []); assert.deepEqual(f.haptics, []);
  ui.unmount();
  payments.clearNativePayments();
  const restart = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
  await restart.flush(); assert.equal(f.requests.length, 2); assert.deepEqual(f.calls, []); assert.equal(restart.tree(), null);
  assert.equal((await f.store.load(account)).length, 1); restart.unmount();
});

test('startup recovery defers to event links, scanners and explicit checkout verification', async () => {
  const f = await fixture();
  const state = { index: 1, routes: [{ name: 'Tabs' }, { name: 'Event' }] };
  const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state }, f.deps);
  await ui.flush(); assert.equal(f.calls.length, 0); assert.deepEqual(f.requests, []);
  f.route({ name: 'CheckoutReturn', params: { eventId, nativeOrderId: orderId } });
  ui.setProps({ navigation: f.navigation, state: { ...state } }); await ui.flush();
  f.route({ name: 'Home' }); ui.setProps({ navigation: f.navigation, state: tabs() }); await ui.flush();
  assert.equal(f.calls.length, 0, 'Returning from nested confirmation must not push another copy');
  ui.unmount();
});

test('only a server-confirmed payment opens the success sheet, once, without another verification page', async () => {
  const f = await fixture(); f.server('completed');
  const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
  await ui.flush();
  assert.deepEqual(purchaseCompletion.getSnapshot(), { eventId, orderId, owner: 'token-A' });
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [['Event', { id: eventId, presentation: 'page' }]]);
  assert.doesNotMatch(JSON.stringify(f.calls), /secret|token-A|pk_test|acct_/);
  assert.deepEqual(f.haptics, ['success']); assert.equal(f.requests.length, 1);
  assert.equal((await f.store.load(account)).length, 1, 'Confirmed purchase stays recoverable until its sheet is dismissed');
  f.advance(61_000); f.appState('active'); ui.setProps({ navigation: f.navigation, state: tabs() }); await ui.flush();
  assert.equal(f.calls.length, 1); assert.equal(f.requests.length, 1);
  for (const key of ['orders', 'tickets', 'event']) assert.ok(f.invalidations.includes(key));
  ui.unmount();
});

test('offline, missing and malformed responses keep recovery without interrupting the app', async () => {
  for (const status of ['offline', 'missing', 'malformed'] as const) {
    const f = await fixture(); f.server(status);
    const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
    await ui.flush(); assert.equal(ui.tree(), null); assert.deepEqual(f.calls, []); assert.deepEqual(f.haptics, []);
    assert.equal(purchaseCompletion.getSnapshot(), null); assert.equal((await f.store.load(account)).length, 1);
    assert.equal(payments.getPendingNativePayment(eventId, 'token-A')?.session.orderId, orderId);
    f.server('completed'); f.advance(61_000); f.appState('active'); await ui.flush();
    assert.equal(f.requests.length, 2); assert.equal(purchaseCompletion.getSnapshot()?.orderId, orderId);
    ui.unmount();
  }
});

test('only server-confirmed failure or refund removes recovery, without showing an error on startup', async () => {
  for (const status of ['failed', 'refunded'] as const) {
    const f = await fixture(); f.server(status);
    const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
    await ui.flush(); assert.equal(ui.tree(), null); assert.deepEqual(f.calls, []); assert.deepEqual(f.haptics, []);
    assert.deepEqual(await f.store.load(account), []);
    assert.equal(payments.getPendingNativePayment(eventId, 'token-A'), undefined);
    assert.ok(f.invalidations.includes('tickets')); assert.ok(f.invalidations.includes('orders'));
    ui.unmount();
  }
});

test('a response after navigation/background is retained and shown only when Tabs is active again', async () => {
  for (const leave of ['event', 'background'] as const) {
    const f = await fixture(); let release!: () => void;
    f.gate(new Promise<void>(resolve => { release = resolve; })); f.server('completed');
    const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
    await ui.flush(); assert.equal(f.requests.length, 1);
    if (leave === 'event') ui.setProps({ navigation: f.navigation, state: { index: 1, routes: [{ name: 'Tabs' }, { name: 'Event' }] } });
    else f.appState('background');
    await ui.flush(); release(); await ui.flush();
    assert.deepEqual(f.calls, []); assert.equal(purchaseCompletion.getSnapshot(), null);
    if (leave === 'event') ui.setProps({ navigation: f.navigation, state: tabs() });
    else f.appState('active');
    await ui.flush(); assert.equal(f.calls.length, 1); assert.equal(f.requests.length, 1, 'No second request can turn a verified success into an error');
    ui.unmount();
  }
});

test('late reconciliation cannot publish success or delete recovery after an account switch', async () => {
  const f = await fixture(); let release!: () => void;
  f.gate(new Promise<void>(resolve => { release = resolve; })); f.server('completed');
  const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
  await ui.flush(); f.auth.user.id = otherAccount; f.auth.token = 'token-B'; ui.render(); await ui.flush();
  release(); await ui.flush();
  assert.deepEqual(f.calls, []); assert.deepEqual(f.haptics, []); assert.deepEqual(f.invalidations, []);
  assert.equal(purchaseCompletion.getSnapshot(), null); assert.equal((await f.store.load(account)).length, 1);
  ui.unmount();
});

test('an explicit checkout success cannot reopen from a late background reply during slow Keychain cleanup', async () => {
  const f = await fixture(); let releaseRequest!: () => void, releaseCleanup!: () => void;
  f.gate(new Promise<void>(resolve => { releaseRequest = resolve; })); f.server('completed');
  const cleanup = new Promise<void>(resolve => { releaseCleanup = resolve; });
  payments.configureNativePaymentRecovery({ ...f.store, remove: async (accountId, order) => { await cleanup; return f.store.remove(accountId, order); } });
  const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
  await ui.flush(); assert.equal(f.requests.length, 1);
  ui.setProps({ navigation: f.navigation, state: { index: 1, routes: [{ name: 'Tabs' }, { name: 'Event' }] } }); await ui.flush();
  const entry = payments.getNativePayment(orderId, eventId, 'token-A')!;
  await payments.resolveNativePayment(entry, async () => ({ orderId, status: 'completed' }));
  const receipt = purchaseCompletion.confirm({ orderId, status: 'completed' }, eventId, 'token-A')!;
  const acknowledgment = payments.acknowledgeNativePayment(entry);
  purchaseCompletion.dismiss(receipt);
  releaseRequest(); await ui.flush();
  ui.setProps({ navigation: f.navigation, state: tabs() }); await ui.flush();
  assert.equal(entry.restored, true, 'Secure cleanup is still running');
  assert.deepEqual(f.calls, []); assert.deepEqual(f.haptics, []); assert.equal(purchaseCompletion.getSnapshot(), null);
  releaseCleanup(); await acknowledgment; await ui.flush();
  assert.deepEqual(await f.store.load(account), []); assert.deepEqual(f.calls, []);
  ui.unmount();
});

test('locked recovery storage is quiet and retried on foreground without losing the stored order', async () => {
  const f = await fixture(); let locked = true, reads = 0;
  payments.configureNativePaymentRecovery({ ...f.store, load: async id => { reads++; if (locked) throw Error('Keychain locked'); return f.store.load(id); } });
  const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
  await ui.flush(); assert.equal(ui.tree(), null); assert.deepEqual(f.calls, []); assert.equal(reads, 1);
  f.appState('active'); await ui.flush(); assert.equal(reads, 1);
  locked = false; f.advance(61_000); f.appState('active'); await ui.flush();
  assert.equal(f.requests.length, 1); assert.equal((await f.store.load(account)).length, 1);
  ui.unmount();
});

test('recovery bounds each pass and advances past old unresolved orders instead of starving newer ones', async () => {
  const f = await fixture();
  const ids = [orderId, ...Array.from({ length: 5 }, (_, i) => `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`)];
  for (const id of ids.slice(1)) await f.store.save({ session: { ...session, orderId: id }, eventId, accountId: account, cancelRequested: false });
  const ui = mount('checkout/PaymentRecovery.tsx', 'PaymentRecovery', { navigation: f.navigation, state: tabs() }, f.deps);
  await ui.flush(); assert.equal(f.requests.length, 4); assert.deepEqual(f.requestedOrders, ids.slice(0, 4));
  f.advance(61_000); f.appState('active'); await ui.flush();
  assert.deepEqual(f.requestedOrders.slice(4, 6), ids.slice(4));
  assert.equal(f.requests.length, 8); assert.deepEqual(f.calls, []);
  ui.unmount();
});

test('restored confirmation shows pending, then hands server-confirmed success to the event without prematurely acknowledging recovery', async () => {
  const f = await fixture();
  const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
  await ui.flush();
  assert.ok(ui.text('checkoutResult.pendingTitle'));
  assert.ok(ui.find('checkout-recheck')); assert.equal(ui.find('checkout-view-tickets'), undefined);
  assert.equal(f.requests.length, 4);
  f.server('completed'); f.subscriptions.forEach(fn => fn('active')); await ui.flush();
  assert.equal(ui.find('checkout-view-tickets'), undefined, 'There is no full-page success');
  assert.deepEqual(purchaseCompletion.getSnapshot(), { eventId, orderId, owner: 'token-A' });
  assert.deepEqual(f.haptics, ['success']);
  assert.equal(f.calls[0][1], eventId, 'Returns to the original event');
  ui.unmount();
  assert.equal((await f.store.load(account)).length, 1, 'Receipt stays durable until success sheet is dismissed');
});

test('offline recovery stays retryable and the cancel action is verified by the server', async () => {
  const f = await fixture(); f.server('offline');
  const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
  await ui.flush(); assert.ok(ui.text('checkoutResult.unavailableTitle'));
  assert.equal((await f.store.load(account)).length, 1);
  f.server('failed'); ui.find('checkout-cancel-attempt').props.onPress(); await ui.flush();
  assert.ok(f.requests.at(-1)?.endsWith('/cancel')); assert.ok(ui.text('checkoutResult.cancelledTitle'));
  ui.find('checkout-return-to-event').props.onPress(); await ui.flush();
  assert.deepEqual(await f.store.load(account), []);
  ui.unmount();
});

test('another account cannot verify the previous account order through a restored route', async () => {
  const f = await fixture(); f.auth.user.id = otherAccount; f.auth.token = 'token-B';
  const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
  await ui.flush();
  assert.ok(ui.text('checkoutResult.invalidHint')); assert.deepEqual(f.requests, []);
  assert.equal((await f.store.load(account)).length, 1);
  ui.unmount();
});

test('native Back retains pending recovery and the success handoff retains its receipt until dismissal', async () => {
  for (const server of ['pending', 'completed'] as const) {
    const f = await fixture(); f.server(server);
    const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
    await ui.flush(); ui.unmount();
    assert.equal((await f.store.load(account)).length, 1);
  }
});

test('one manual check, rapid double taps and unavailable results never create a payment or clear pending recovery', async () => {
  const f = await fixture();
  const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
  await ui.flush();
  const press = ui.find('checkout-recheck').props.onPress;
  f.server('offline'); press(); press(); await ui.flush();
  assert.equal(f.requests.length, 5);
  assert.equal(ui.find('checkout-recheck'), undefined);
  assert.ok(ui.text('checkoutResult.unavailableAfterCheckHint'));
  assert.equal(ui.find('checkout-return-to-event'), undefined);
  assert.equal(ui.find('checkout-view-tickets'), undefined);
  assert.ok(ui.find('checkout-check-tickets')); assert.ok(ui.find('checkout-contact-support'));
  assert.deepEqual(f.haptics, []);
  assert.equal((await f.store.load(account)).length, 1);
  f.server('completed'); f.subscriptions.forEach(fn => fn('active')); await ui.flush();
  assert.equal(purchaseCompletion.getSnapshot()?.orderId, orderId); assert.deepEqual(f.haptics, ['success']);
  f.subscriptions.forEach(fn => fn('active')); await ui.flush();
  assert.deepEqual(f.haptics, ['success']);
  ui.unmount();
});

test('a cancellation still under server review cannot become a failed purchase or discard recovery', async () => {
  const f = await fixture();
  const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
  await ui.flush();
  ui.find('checkout-cancel-attempt').props.onPress(); await ui.flush();
  assert.ok(f.requests.at(-1)?.endsWith('/cancel'));
  assert.ok(ui.text('checkoutResult.pendingTitle'));
  assert.equal(ui.find('checkout-return-to-event'), undefined);
  assert.equal(ui.find('checkout-view-tickets'), undefined);
  assert.deepEqual(f.invalidations, []);
  assert.deepEqual(f.haptics, []);
  ui.find('checkout-check-tickets').props.onPress(); await ui.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1))), ['Tabs', { screen: 'Profile', params: { screen: 'Tickets' } }]);
  ui.unmount();
  assert.equal((await f.store.load(account)).length, 1, 'Checking tickets must retain the unresolved attempt');
});

test('every server-confirmed terminal result refreshes orders and tickets, but only success vibrates', async () => {
  for (const status of ['completed', 'failed', 'refunded'] as const) {
    const f = await fixture(); f.server(status);
    const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
    await ui.flush();
    for (const key of ['orders', 'tickets', 'event']) assert.ok(f.invalidations.includes(key), status + ': ' + key);
    assert.deepEqual(f.haptics, status === 'completed' ? ['success'] : []);
    ui.unmount();
  }
});

test('missing payment and refunds get distinct results instead of a generic failure', async () => {
  for (const status of ['missing', 'refunded'] as const) {
    const f = await fixture(); f.server(status);
    const ui = mount('screens/CheckoutReturnScreen.tsx', 'CheckoutReturnScreen', { navigation: f.navigation, route: { params: { eventId, nativeOrderId: orderId } } }, f.deps);
    await ui.flush();
    assert.ok(ui.text('checkoutResult.' + status + 'Title'));
    assert.equal(ui.find('checkout-recheck'), undefined); assert.equal(ui.find('checkout-view-tickets'), undefined);
    assert.equal(!!ui.find('checkout-return-to-event'), status === 'refunded');
    assert.deepEqual(f.haptics, []); ui.unmount();
  }
});
