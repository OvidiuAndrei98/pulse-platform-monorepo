// Signing identifiers are public metadata; never include private signing keys here.
const fs = require('node:fs'), path = require('node:path');
const { expo } = require('../app.json');
// Match Expo's env loading when invoked through pnpm configure:links.
require('node:module').createRequire(require.resolve('expo/package.json'))('@expo/env').load(path.resolve(__dirname, '..'));
const { associationDocuments, mergeAppleAssociation } = require('./native-config.cjs');
const docs = associationDocuments({ teamId: process.env.SPOTTR_NATIVE_APPLE_TEAM_ID?.trim(), fingerprints: process.env.SPOTTR_NATIVE_ANDROID_SHA256, bundleId: expo.ios.bundleIdentifier, packageName: expo.android.package });
const directory = path.resolve(__dirname, '../../pulse-app/public/.well-known');
function read(name, fallback) { const file = path.join(directory, name); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; }
if (docs.apple) {
  const previous = read('apple-app-site-association', {}), entry = docs.apple.applinks.details[0];
  const merged = mergeAppleAssociation(previous, entry);
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'apple-app-site-association'), JSON.stringify(merged, null, 2) + '\n');
  console.log('Updated iOS association; publish on each configured host.');
} else console.log('iOS link activation pending: set SPOTTR_NATIVE_APPLE_TEAM_ID (from Xcode Signing & Capabilities).');
if (docs.android) {
  const previous = read('assetlinks.json', []), entry = docs.android[0];
  const existingHashes = previous.filter(v => v.target?.package_name === entry.target.package_name).flatMap(v => v.target.sha256_cert_fingerprints ?? []);
  entry.target.sha256_cert_fingerprints = [...new Set([...existingHashes, ...entry.target.sha256_cert_fingerprints])];
  const merged = [...previous.filter(v => v.target?.package_name !== entry.target.package_name), entry];
  fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, 'assetlinks.json'), JSON.stringify(merged, null, 2) + '\n');
  console.log('Updated Android association; publish on each configured host.');
} else console.log('Android link activation pending: set SPOTTR_NATIVE_ANDROID_SHA256 (signing certificate SHA-256, not SHA-1).');
