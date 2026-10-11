const { expo } = require('./app.json');
const { appLinkPaths, linkHosts } = require('./scripts/native-config.cjs');

module.exports = () => {
  const hosts = linkHosts(process.env.EXPO_PUBLIC_LINK_HOSTS);
  const merchantIdentifier = process.env.SPOTTR_NATIVE_APPLE_MERCHANT_ID?.trim();
  if (merchantIdentifier && !/^merchant\.[a-zA-Z0-9.-]+$/.test(merchantIdentifier)) throw new Error('Invalid SPOTTR_NATIVE_APPLE_MERCHANT_ID');
  const googlePayEnabled = process.env.SPOTTR_NATIVE_GOOGLE_PAY_ENABLED === 'true';
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const hasAppleSigning = /^[A-Z0-9]{10}$/.test(process.env.SPOTTR_NATIVE_APPLE_TEAM_ID?.trim() || '');
  return {
    ...expo,
    ios: {
      ...expo.ios,
      infoPlist: { ...expo.ios.infoPlist, CFBundleAllowMixedLocalizations: true, CFBundleLocalizations: ['en', 'ro'] },
      // Keep personal-team development builds installable without this paid entitlement.
      ...(hasAppleSigning ? { associatedDomains: hosts.map(host => `applinks:${host}`) } : {}),
    },
    android: {
      ...expo.android,
      intentFilters: hosts.map(host => ({
        action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'],
        data: appLinkPaths.map(pathPrefix => ({ scheme: 'https', host, pathPrefix })),
      })),
    },
    extra: { ...expo.extra, mapsAndroidConfigured: !!androidKey, stripeMerchantIdentifier: merchantIdentifier, stripeGooglePayEnabled: googlePayEnabled },
    plugins: [
      ...expo.plugins,
      ['@stripe/stripe-react-native', { ...(merchantIdentifier ? { merchantIdentifier } : {}), enableGooglePay: googlePayEnabled }],
      ['react-native-maps', { ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}) }],
      ['expo-location', { locationWhenInUsePermission: 'Allow SPOTTR to show events near you.' }],
    ],
  };
};
