import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(file: string, component: unknown) {
  const output = ts.transpileModule(readFileSync(resolve(__dirname, '../src/navigation', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports: any = {};
  runInNewContext(output, { exports, require(name: string) {
    if (name === './FixedCapsuleTabBar') return { FixedCapsuleTabBar: component };
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

test('Android and web keep their existing shared renderer', () => {
  assert.equal(load('NativeTabBar.tsx', null).NativeTabBar, null);
});
