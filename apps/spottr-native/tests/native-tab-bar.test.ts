import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(file: string, component: unknown, android = false) {
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: any = {};
  runInNewContext(output, { exports, require(name: string) {
    if (!android && name === './FixedCapsuleTabBar') return { FixedCapsuleTabBar: component };
    if (android && name === './SimpleCapsuleTabBar') return { SimpleCapsuleTabBar: component };
    throw Error('Navbar must not select a separate native implementation: ' + name);
  } });
  return exports;
}

test('Expo Go and installed iOS builds use the same component without probing a custom native view', () => {
  const sharedComponent = () => null;
  const expoGo = load('NativeTabBar.ios.tsx', sharedComponent);
  const installedApp = load('NativeTabBar.ios.tsx', sharedComponent);
  assert.equal(expoGo.NativeTabBar, sharedComponent);
  assert.equal(installedApp.NativeTabBar, expoGo.NativeTabBar);
});

test('unrecognized platforms keep the generic fallback', () => {
  assert.equal(load('NativeTabBar.tsx', null).NativeTabBar, null);
});

test('Android resolves the simple capsule adapter, independently of iOS glass support', () => {
  const android = () => null;
  assert.equal(load('NativeTabBar.android.tsx', android, true).NativeTabBar, android);
});

test('native web resolves the matching simple capsule without selecting the iPhone adapter', () => {
  const component = () => null;
  assert.equal(load('NativeTabBar.web.tsx', component, true).NativeTabBar, component);
});
