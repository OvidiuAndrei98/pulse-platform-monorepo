const fs = require('node:fs');
const path = require('node:path');

const requiredSources = [
  'modules/spottr-native-tabs/expo-module.config.json',
  'modules/spottr-native-tabs/ios/SpottrNativeTabs.podspec',
  'modules/spottr-native-tabs/ios/SpottrNativeTabsModule.swift',
  'modules/spottr-native-tabs/ios/SpottrTabIcons.swift',
];

function verifyIosNativeSources(root = path.resolve(__dirname, '..')) {
  const missing = requiredSources.filter(file => !fs.existsSync(path.join(root, file)));
  if (missing.length) throw new Error(
    'The iOS checkout is missing native navbar sources:\n' + missing.join('\n') +
    '\nSync the complete modules/spottr-native-tabs directory before installing Pods and rebuilding. ' +
    'Only /ios/ at the app root should be gitignored, not modules/*/ios/.',
  );
}

if (require.main === module) {
  try {
    verifyIosNativeSources();
    console.log('iOS native navbar sources present.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { requiredSources, verifyIosNativeSources };
