import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { isConnectivityError } from '../src/scanner/data';
import { ApiError } from '../src/data/http';

function nativeFixture(available = true) {
  let resolve: (value: unknown) => void = () => {}, changed: (value: unknown) => void = () => {}, foreground: (value: string) => void = () => {};
  let removed = 0;
  const sdk = {
    getNetworkStateAsync: () => new Promise(done => { resolve = done; }),
    addNetworkStateListener: (listener: typeof changed) => { changed = listener; return { remove: () => removed++ }; },
  };
  const exports: any = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/scanner/connection.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, require: (name: string) => {
    if (name === 'expo') return { requireOptionalNativeModule: () => available ? {} : null };
    if (name === 'expo-network' && available) return sdk;
    if (name === 'react-native') return { AppState: { addEventListener: (_: string, listener: typeof foreground) => { foreground = listener; return { remove: () => removed++ }; } } };
    throw Error('Unexpected or unavailable native module: ' + name);
  } });
  return { runtime: exports, resolve: (value: unknown) => resolve(value), change: (value: unknown) => changed(value), foreground: () => foreground('active'), removed: () => removed };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('native connection changes override older reads and stop delivering after unmount', async () => {
  const f = nativeFixture(), seen: unknown[] = [];
  const stop = f.runtime.watchScannerConnection((value: unknown) => seen.push(value));
  f.change({ isConnected: false, isInternetReachable: false });
  f.resolve({ isConnected: true }); await flush();
  assert.deepEqual(seen, [false]);
  f.foreground(); f.resolve({ isConnected: true, isInternetReachable: false }); await flush();
  assert.deepEqual(seen, [false, false]);
  f.change({ isConnected: true, isInternetReachable: true }); assert.equal(seen.at(-1), true);
  f.foreground(); stop(); f.resolve({ isConnected: false }); await flush();
  assert.equal(seen.at(-1), true); assert.equal(f.removed(), 2);
});

test('a previous installed binary remains usable until Expo Network is included in a rebuild', async () => {
  const f = nativeFixture(false);
  assert.equal(await f.runtime.getScannerConnection(), null);
});

test('native transport failures trigger the offline fallback without masking auth, parsing or storage failures', () => {
  for (const value of [new TypeError('Network request failed'), new Error('Network request failed'), new Error('Load failed'), new ApiError(0, 'TIMEOUT')]) assert.equal(isConnectivityError(value), true);
  for (const value of [new ApiError(401, 'EXPIRED'), new ApiError(403, 'DENIED'), new ApiError(0, 'INVALID_RESPONSE'), new Error('OFFLINE_STORAGE_CORRUPT'), new Error('DISK_FULL')]) assert.equal(isConnectivityError(value), false);
});
