// Generated public assets come only from pinned local packages, never a CDN.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
function syncMapAssets(app = process.cwd()) {
  const requireApp = createRequire(path.join(app, 'package.json'));
  const packageRoot = path.dirname(requireApp.resolve('maplibre-gl/package.json'));
  const output = path.join(app, 'public');
  fs.mkdirSync(output, { recursive: true });
  fs.copyFileSync(path.join(packageRoot, 'dist/maplibre-gl-worker.mjs'), path.join(output, 'maplibre-worker.mjs'));
  fs.copyFileSync(path.resolve(__dirname, '../apps/pulse-app/src/features/events/map/openFreeMapLicense.txt'), path.join(output, 'map-style-license.txt'));
  const entry = path.join(app, 'src/map/webview/mapDocument.ts');
  if (!fs.existsSync(entry)) return;
  const { buildSync } = requireApp('esbuild');
  const worker = fs.readFileSync(path.join(packageRoot, 'dist/maplibre-gl-worker.mjs'), 'utf8');
  const result = buildSync({ entryPoints: [entry], bundle: true, write: false, minify: true,
    format: 'iife', target: 'safari16', legalComments: 'inline',
    define: { __SPOTTR_MAP_WORKER__: JSON.stringify(worker) } });
  const css = fs.readFileSync(path.join(packageRoot, 'dist/maplibre-gl.css'), 'utf8') + '\n' +
    fs.readFileSync(path.resolve(__dirname, '../apps/pulse-app/src/features/events/map/vectorMap.css'), 'utf8');
  const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const document = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; connect-src https://tiles.openfreemap.org; img-src data: blob: https://tiles.openfreemap.org;"><style>html,body{margin:0;height:100%;overflow:hidden;background:#101012}button{box-sizing:border-box;-webkit-tap-highlight-color:transparent}${css}</style></head><body><div id="map" class="spottr-vector-map" role="region"></div><script>${script}</script></body></html>`;
  const target = path.join(app, 'src/map/webview/event-map.html');
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== document) fs.writeFileSync(target, document);
}
module.exports = { syncMapAssets };
if (require.main === module) syncMapAssets();
