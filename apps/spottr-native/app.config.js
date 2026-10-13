const { expo } = require('./app.json');
const { appLinkPaths, linkHosts } = require('./scripts/native-config.cjs');

module.exports = () => {
  const hosts = linkHosts(process.env.EXPO_PUBLIC_LINK_HOSTS);
  const merchantIdentifier = process.env.SPOTTR_NATIVE_APPLE_MERCHANT_ID?.trim();
  if (merchantIdentifier && !/^merchant\.[a-zA-Z0-9.-]+$/.test(merchantIdentifier)) throw new Error('Invalid SPOTTR_NATIVE_APPLE_MERCHANT_ID');
  const googlePayEnabled = process.env.SPOTTR_NATIVE_GOOGLE_PAY_ENABLED === 'true';
  const pushProjectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() || expo.extra?.eas?.projectId;
  if (pushProjectId && !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(pushProjectId)) throw new Error('Invalid EXPO_PUBLIC_EAS_PROJECT_ID');
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
      ...(process.env.SPOTTR_NATIVE_GOOGLE_SERVICES_FILE ? { googleServicesFile: process.env.SPOTTR_NATIVE_GOOGLE_SERVICES_FILE } : {}),
      intentFilters: hosts.map(host => ({
        action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'],
        data: appLinkPaths.map(pathPrefix => ({ scheme: 'https', host, pathPrefix })),
      })),
    },
    extra: { ...expo.extra, ...(pushProjectId ? { eas: { projectId: pushProjectId } } : {}), mapsAndroidConfigured: !!androidKey, stripeMerchantIdentifier: merchantIdentifier, stripeGooglePayEnabled: googlePayEnabled },
    plugins: [
      ...expo.plugins,
      // Leave personal-team builds usable until push credentials are configured.
      ['./scripts/with-push-notifications.cjs', { enabled: !!pushProjectId }],
      ['@stripe/stripe-react-native', { ...(merchantIdentifier ? { merchantIdentifier } : {}), enableGooglePay: googlePayEnabled }],
      ['react-native-maps', { ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}) }],
      ['expo-location', { locationWhenInUsePermission: 'Allow SPOTTR to show events near you.' }],
    ],
  };
};
