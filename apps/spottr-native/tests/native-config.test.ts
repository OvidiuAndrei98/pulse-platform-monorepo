import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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
