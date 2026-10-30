// Generated public assets come only from pinned local packages, never a CDN.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const app = process.cwd();
const requireApp = createRequire(path.join(app, 'package.json'));
const packageRoot = path.dirname(requireApp.resolve('maplibre-gl/package.json'));
const output = path.join(app, 'public');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(packageRoot, 'dist/maplibre-gl-worker.mjs'), path.join(output, 'maplibre-worker.mjs'));
fs.copyFileSync(path.resolve(__dirname, '../apps/pulse-app/src/features/events/map/openFreeMapLicense.txt'), path.join(output, 'map-style-license.txt'));
