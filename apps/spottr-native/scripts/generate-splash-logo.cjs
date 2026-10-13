// Rasterize the existing vector mark for native launch screens; no new artwork.
const path = require('node:path');
const { createRequire } = require('node:module');
const fromNext = createRequire(require.resolve('next/package.json', { paths: [path.resolve(__dirname, '../../pulse-app')] }));
const sharp = fromNext('sharp');
sharp(path.resolve(__dirname, '../../pulse-app/public/spottr-logo.svg'))
  .resize(512, 512, { fit: 'contain', background: '#00000000' })
  .png()
  .toFile(path.resolve(__dirname, '../assets/splash-logo.png'))
  .catch(error => { console.error(error); process.exitCode = 1; });
