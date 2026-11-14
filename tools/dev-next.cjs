const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

const app = path.resolve(__dirname, '../apps/pulse-app');
const requireApp = createRequire(path.join(app, 'package.json'));
function run(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: app, stdio: 'inherit', env, windowsHide: true });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(path.join(__dirname, 'sync-design-tokens.cjs'), ['--check']);
run(path.join(__dirname, 'sync-map-assets.cjs'));
const args = process.argv.slice(2);
if (!args.some(arg => arg === '-p' || arg === '--port' || arg.startsWith('--port=') || arg.startsWith('-p='))) {
  args.push('--port', '3000');
}
run(requireApp.resolve('next/dist/bin/next'), ['dev', ...args], { ...process.env, NODE_ENV: 'development' });
