import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const { appLinkPaths, linkHosts, associationDocuments, mergeAppleAssociation } = require('../scripts/native-config.cjs');

test('native link configuration does not invent signing identities and rejects malformed inputs', () => {
  const ids = { bundleId: 'ro.test.preview', packageName: 'ro.test.preview' };
  assert.deepEqual(associationDocuments(ids), { apple: null, android: null });
  for (const teamId of ['secret', '1234567890.evil', '../file']) assert.throws(() => associationDocuments({ ...ids, teamId }));
  assert.throws(() => associationDocuments({ ...ids, fingerprints: 'AA:BB' }));
  for (const value of ['https://spottr.ro', '*.spottr.ro', 'spottr.ro/path']) assert.throws(() => linkHosts(value));
  assert.deepEqual(linkHosts('spottr.ro,spottr.ro,dev.spottr.ro'), ['spottr.ro', 'dev.spottr.ro']);
  const fingerprint = Array(32).fill('AA').join(':');
  const docs = associationDocuments({ ...ids, teamId: 'AB12345678', fingerprints: fingerprint });
  assert.equal(docs.apple.applinks.details[0].appID, 'AB12345678.ro.test.preview');
  assert.equal(docs.android[0].target.sha256_cert_fingerprints[0], fingerprint);
  // Provider return pages stay in the browser so the bridge can finish auth/payment.
  assert.ok(appLinkPaths.includes('/events')); assert.ok(!appLinkPaths.includes('/auth')); assert.ok(!appLinkPaths.includes('/organizers')); assert.ok(!appLinkPaths.includes('/checkout'));
});

test('link activation preserves other apps sharing an Apple association entry', () => {
  const components = [{ '/': '/shared/*' }];
  const previous = { webcredentials: { apps: ['TEAM.web'] }, applinks: { details: [
    { appIDs: ['TEAM.native', 'TEAM.other'], components },
    { appID: 'TEAM.unrelated', paths: ['/other/*'] },
  ] } };
  const entry = { appID: 'TEAM.native', paths: ['/events/*'] };
  const merged = mergeAppleAssociation(previous, entry);
  assert.deepEqual(merged.applinks.details, [
    { appIDs: ['TEAM.other'], components }, previous.applinks.details[1], entry,
  ]);
  assert.deepEqual(merged.webcredentials, previous.webcredentials);
  assert.deepEqual(mergeAppleAssociation(merged, entry), merged);
  assert.deepEqual(previous.applinks.details[0]?.appIDs, ['TEAM.native', 'TEAM.other']);
});

test('push configuration stays optional for Personal Team builds and validates the project before activation', () => {
  const configFile = require.resolve('../app.config.js'), configRequire = createRequire(configFile);
  const env: Record<string, string> = {}, base = { plugins: [], ios: {}, android: {}, extra: {} as { eas?: { projectId: string } } };
  const module = { exports: undefined as unknown as () => any };
  runInNewContext(readFileSync(configFile, 'utf8'), {
    module, process: { env }, require: (name: string) => name === './app.json' ? { expo: base } : configRequire(name),
  });
  const createConfig = module.exports;
  const pushEnabled = (config: { plugins: unknown[] }) => config.plugins.some(plugin => Array.isArray(plugin) && plugin[0] === './scripts/with-push-notifications.cjs' && plugin[1]?.enabled);
  assert.equal(pushEnabled(createConfig()), false, 'An unconfigured Personal Team build must not request the push entitlement');
  env.EXPO_PUBLIC_EAS_PROJECT_ID = '00000000-0000-4000-8000-000000000001';
  const configured = createConfig();
  assert.equal(pushEnabled(configured), true);
  assert.equal(configured.extra.eas.projectId, env.EXPO_PUBLIC_EAS_PROJECT_ID);
  env.EXPO_PUBLIC_EAS_PROJECT_ID = 'not-an-expo-project';
  assert.throws(() => createConfig(), /Invalid EXPO_PUBLIC_EAS_PROJECT_ID/);
  delete env.EXPO_PUBLIC_EAS_PROJECT_ID;
  base.extra.eas = { projectId: '00000000-0000-4000-8000-000000000002' };
  assert.equal(createConfig().extra.eas.projectId, base.extra.eas.projectId, 'An existing EAS-linked app needs no duplicate env value');
});

test('the actual Expo entitlement chain removes APNs for free builds and preserves it for configured push', async () => {
  const withPush = require('../scripts/with-push-notifications.cjs');
  const withImplicitNotifications = require('expo-notifications/app.plugin').default;
  for (const enabled of [false, true]) {
    let config = withPush({ name: 'QA', slug: 'qa' }, { enabled });
    config = withImplicitNotifications(config, {});
    const result = await config.mods.ios.entitlements({
      ...config, modRequest: {}, modResults: { 'aps-environment': 'production', 'keychain-access-groups': ['qa'] },
    });
    assert.equal(result.modResults['aps-environment'], enabled ? 'production' : undefined);
    assert.deepEqual(result.modResults['keychain-access-groups'], ['qa']);
  }
});
