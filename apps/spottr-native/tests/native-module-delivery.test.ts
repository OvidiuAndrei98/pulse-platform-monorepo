import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { requiredSources, verifyIosNativeSources } = require('../scripts/verify-ios-native-sources.cjs');
const app = path.resolve(__dirname, '..');

test('local Expo module sources can be shipped through Git while generated Xcode/Android projects stay ignored', () => {
  const generated = ['ios/Podfile', 'android/build.gradle'];
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin'], {
    cwd: app, encoding: 'utf8', input: [...requiredSources, ...generated].join('\n') + '\n',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split(/\r?\n/).sort(), generated.sort(),
    'Ignoring every ios/ directory silently removes the native navbar from another machine\'s build');
  assert.doesNotThrow(() => verifyIosNativeSources(app));
});

test('iOS preflight rejects the config-only checkout that previously passed bundling and pod-install', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'spottr-native-source-'));
  try {
    const config = path.join(fixture, requiredSources[0]);
    mkdirSync(path.dirname(config), { recursive: true }); writeFileSync(config, '{}');
    assert.throws(() => verifyIosNativeSources(fixture), /SpottrNativeTabsModule\.swift/);
    for (const source of requiredSources.slice(1)) {
      const file = path.join(fixture, source); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, 'fixture');
    }
    assert.doesNotThrow(() => verifyIosNativeSources(fixture));
  } finally {
    // Only the exact directory returned by mkdtempSync inside the system temp root.
    const resolved = path.resolve(fixture), parent = path.resolve(tmpdir()) + path.sep;
    assert.ok(resolved.startsWith(parent) && path.basename(resolved).startsWith('spottr-native-source-'));
    rmSync(resolved, { recursive: true, force: true });
  }
});
