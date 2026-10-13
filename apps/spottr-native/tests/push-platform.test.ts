import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PushRegistry, parsePushRegistration } from '../src/notifications/pushRegistry';

const project = '11111111-1111-4111-8111-111111111111';
function fixture(hasNative = true, platform = 'ios') {
  const calls: string[] = [];
  const state = { granted: false, canAskAgain: true, enabled: true, projectId: project };
  let listener: ((value: unknown) => void) | undefined, initialResolve: ((value: unknown) => void) | undefined;
  const sdk = {
    AndroidImportance: { DEFAULT: 3 }, IosAuthorizationStatus: { PROVISIONAL: 3 }, DEFAULT_ACTION_IDENTIFIER: 'tap',
    setNotificationChannelAsync: async () => { calls.push('channel'); },
    getPermissionsAsync: async () => { calls.push('permissions'); return { granted: state.granted, canAskAgain: state.canAskAgain }; },
    requestPermissionsAsync: async () => { calls.push('prompt'); state.granted = true; return { granted: true }; },
    getExpoPushTokenAsync: async () => { calls.push('token'); return { data: 'ExpoPushToken[abcdefghijklmnop]' }; },
    setNotificationHandler: () => {},
    addNotificationReceivedListener: () => ({ remove: () => {} }),
    addNotificationResponseReceivedListener: (callback: (value: unknown) => void) => { listener = callback; return { remove: () => {} }; },
    getLastNotificationResponseAsync: () => new Promise(resolve => { initialResolve = resolve; }),
    clearLastNotificationResponseAsync: async () => {},
  };
  const modules: Record<string, unknown> = {
    'expo-constants': { expoConfig: { extra: { eas: { projectId: project } } } },
    'expo': { requireOptionalNativeModule: () => hasNative ? {} : null },
    'expo-notifications': sdk,
    'react-native': { Platform: { OS: platform }, Linking: {}, AppState: {} },
    'expo-secure-store': {}, 'expo-crypto': {}, '../config': { API_URL: 'https://example.test/api/v1' },
    '../auth/AuthProvider': { accountApi: async () => { calls.push('config'); return { enabled: state.enabled, projectId: state.projectId }; } },
    './pushRegistry': { PushRegistry, parsePushRegistration },
  };
  const exports: any = {};
  const source = ts.transpileModule(readFileSync(resolve(import.meta.dirname, '../src/notifications/pushPlatform.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(source, { exports, require: (name: string) => { if (name === 'expo-notifications' && !hasNative) throw Error('Old binary must not import missing native SDK'); if (!(name in modules)) throw Error(name); return modules[name]; }, setTimeout, clearTimeout, console });
  return { runtime: exports, calls, state, respond: (value: unknown) => listener?.(value), resolveInitial: (value: unknown) => initialResolve?.(value) };
}
test('older native binaries remain usable when the push module is missing', async () => {
  const f = fixture(false); assert.equal(f.runtime.pushSupported, false);
  let status = '';
  assert.equal(await f.runtime.getPushDevice(true, 'session', (value: string) => { status = value; }), null);
  assert.equal(status, 'unavailable'); assert.deepEqual(f.calls, []);
});
test('automatic registration never asks permission; explicit Android activation creates channel before prompt', async () => {
  const f = fixture(true, 'android'), statuses: string[] = [];
  assert.equal(await f.runtime.getPushDevice(false, 'session', (value: string) => statuses.push(value)), null);
  assert.deepEqual(f.calls, ['config', 'channel', 'permissions']); assert.deepEqual(statuses, ['off']);
  f.calls.length = 0;
  const device = await f.runtime.getPushDevice(true, 'session', () => {});
  assert.deepEqual(f.calls, ['config', 'channel', 'permissions', 'prompt', 'token']);
  assert.equal(device.platform, 'android'); assert.equal(device.projectId, project);
});
test('denied permissions and mismatched server configuration never request a device token', async () => {
  const f = fixture(); f.state.canAskAgain = false;
  let status = '';
  await f.runtime.getPushDevice(true, 'session', (value: string) => { status = value; });
  assert.equal(status, 'denied'); assert.equal(f.calls.includes('prompt'), false); assert.equal(f.calls.includes('token'), false);
  f.state.enabled = false; f.calls.length = 0;
  await f.runtime.getPushDevice(true, 'session', (value: string) => { status = value; });
  assert.equal(status, 'unavailable'); assert.deepEqual(f.calls, ['config']);
});
test('a delayed cold-start response cannot replace a newer notification tap', async () => {
  const f = fixture(), taps: unknown[] = [];
  const stop = f.runtime.listenPush(() => true, () => {}, (data: unknown) => taps.push(data));
  const response = (id: string) => ({ actionIdentifier: 'tap', notification: { request: { content: { data: id } } } });
  f.respond(response('new')); f.resolveInitial(response('old'));
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(taps, ['new']); stop();
});
test('a cold-start callback resolving after unmount is ignored', async () => {
  const f = fixture(), taps: unknown[] = [];
  const stop = f.runtime.listenPush(() => true, () => {}, (data: unknown) => taps.push(data));
  stop(); f.resolveInitial({ actionIdentifier: 'tap', notification: { request: { content: { data: 'old' } } } });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(taps, []);
});
