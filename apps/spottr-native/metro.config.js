const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const { createApiProxy } = require('./scripts/api-proxy.cjs');
require('../../tools/sync-map-assets.cjs').syncMapAssets(__dirname);

const config = getDefaultConfig(__dirname);
if (!config.resolver.assetExts.includes('html')) config.resolver.assetExts.push('html');
// Generated previews and browser profiles are not source. Watching them causes
// unnecessary HMR updates whenever screenshots, exports or Next builds change.
const generatedDirectories = [
  path.join(__dirname, 'artifacts'),
  path.join(__dirname, 'dist'),
  path.join(__dirname, 'dist-native'),
  path.join(__dirname, 'dist-final'),
  path.resolve(__dirname, '../pulse-app/.next'),
];
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
  ...generatedDirectories.map(directory => {
    const escaped = directory.split(/[/\\]+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[/\\\\]');
    return new RegExp(`^${escaped}(?:[/\\\\]|$)`);
  }),
];
const enhance = config.server.enhanceMiddleware;
// Expo loads .env.local before this configuration. Keep its standard middleware.
config.server.enhanceMiddleware = (middleware, server) => {
  const next = enhance ? enhance(middleware, server) : middleware;
  const proxy = createApiProxy(process.env.EXPO_PUBLIC_API_URL || 'https://api.spottr.ro/api/v1');
  return (req, res, fallback) => proxy(req, res, () => next(req, res, fallback));
};

module.exports = config;
