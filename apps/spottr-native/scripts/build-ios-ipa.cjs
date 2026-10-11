// Compile on a macOS runner, then sign/install on Windows with AltStore Classic.
// Release embeds the JS bundle so the installed app does not depend on Metro.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const app = path.resolve(__dirname, '..');
function publicUrl(name, api = false) {
  const raw = process.env[name]?.trim();
  let url;
  try { url = new URL(raw); } catch { throw Error(`${name} must be a public HTTPS URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
      /^(127\.|0\.0\.0\.0$|\[::1\]$)/.test(url.hostname) ||
      (api && !url.pathname.replace(/\/+$/, '').endsWith('/api/v1')) ||
      (!api && url.pathname !== '/')) throw Error(`${name} must be a public HTTPS ${api ? 'API URL ending in /api/v1' : 'website origin'}, without credentials or query parameters.`);
  return url.href.replace(/\/+$/, '');
}

function main() {
  const env = {
    ...process.env,
    EXPO_PUBLIC_API_URL: publicUrl('EXPO_PUBLIC_API_URL', true),
    EXPO_PUBLIC_WEB_URL: publicUrl('EXPO_PUBLIC_WEB_URL'),
    EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', CI: '1',
    // Personal-team sideloading cannot provision these paid capabilities.
    SPOTTR_NATIVE_APPLE_TEAM_ID: '', SPOTTR_NATIVE_APPLE_MERCHANT_ID: '',
    SPOTTR_NATIVE_GOOGLE_PAY_ENABLED: 'false',
  };
  if (process.argv.includes('--check')) {
    console.log('Public build URLs are valid. No Apple signing credentials required.');
    return;
  }
  if (process.platform !== 'darwin') throw Error('Run this build on GitHub Actions (macOS) or a Mac. Install the resulting IPA from Windows with AltStore Classic.');
  function run(command, args, cwd = app, capture = false) {
    const result = spawnSync(command, args, { cwd, env, shell: false, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    if (result.error || result.status !== 0) throw Error(`${command} failed. See the build log above.`);
    return result.stdout?.trim();
  }

  run('xcodebuild', ['-version']);
  run('pnpm', ['exec', 'expo', 'prebuild', '--platform', 'ios', '--no-install']);
  const ios = path.join(app, 'ios');
  run('pod', ['install'], ios);
  const workspaces = fs.readdirSync(ios).filter(name => name.endsWith('.xcworkspace'));
  if (workspaces.length !== 1) throw Error('Expected exactly one generated iOS workspace.');
  const workspace = path.join(ios, workspaces[0]);
  const scheme = path.basename(workspace, '.xcworkspace');
  const projects = JSON.parse(run('xcodebuild', ['-list', '-json', '-workspace', workspace], app, true));
  if (!projects.workspace?.schemes?.includes(scheme)) throw Error('Generated iOS app scheme was not found.');

  const artifacts = path.join(app, 'artifacts');
  fs.mkdirSync(artifacts, { recursive: true });
  // A fresh directory avoids deleting or packaging an unrelated previous build.
  const build = fs.mkdtempSync(path.join(artifacts, 'ios-ipa-'));
  const derived = path.join(build, 'DerivedData');
  run('xcodebuild', ['-workspace', workspace, '-scheme', scheme, '-configuration', 'Release',
    '-sdk', 'iphoneos', '-destination', 'generic/platform=iOS', '-derivedDataPath', derived,
    'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO', 'CODE_SIGN_IDENTITY=', 'DEVELOPMENT_TEAM=', 'build']);
  const products = path.join(derived, 'Build', 'Products', 'Release-iphoneos');
  const apps = fs.readdirSync(products).filter(name => name.endsWith('.app'));
  if (apps.length !== 1) throw Error('Expected exactly one Release device app.');
  const builtApp = path.join(products, apps[0]);
  if (!fs.existsSync(path.join(builtApp, 'main.jsbundle')) || fs.statSync(path.join(builtApp, 'main.jsbundle')).size === 0) {
    throw Error('Release JavaScript bundle is missing. Refusing to package an app that needs Metro.');
  }
  const platform = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleSupportedPlatforms:0', path.join(builtApp, 'Info.plist')], app, true);
  if (platform !== 'iPhoneOS') throw Error('A simulator app cannot be installed on an iPhone.');
  const payload = path.join(build, 'Payload');
  fs.mkdirSync(payload);
  run('ditto', [builtApp, path.join(payload, apps[0])]);
  const archive = path.join(build, 'spottr-native-unsigned.ipa');
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', payload, archive]);
  fs.copyFileSync(archive, path.join(artifacts, 'spottr-native-unsigned.ipa'));
  console.log('Created artifacts/spottr-native-unsigned.ipa. Sign and install with AltStore Classic.');
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
