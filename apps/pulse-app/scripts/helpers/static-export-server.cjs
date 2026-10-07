// Local test transport for the packaged Capacitor export. Mirrors its asset
// router (extensionless paths serve index.html; .txt RSC assets are plain text).
// This tests Next's exported navigation, not WKWebView or native plugins.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

exports.createStaticExportServer = function (directory) {
  const root = path.resolve(directory);
  const types = { '.html': 'text/html', '.txt': 'text/plain', '.js': 'application/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  return http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const extension = path.extname(pathname);
      const file = path.resolve(root, '.' + (extension ? pathname : '/index.html'));
      if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
      const data = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[extension || '.html'] || 'application/octet-stream',
        'Content-Length': data.length, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
      response.writeHead(404).end();
    }
  });
};
