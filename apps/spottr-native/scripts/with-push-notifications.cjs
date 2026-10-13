const { withEntitlementsPlist } = require('expo/config-plugins');
const withNotifications = require('expo-notifications/app.plugin').default;

module.exports = (config, { enabled = false } = {}) => {
  // Mods execute in reverse registration order. Register cleanup first so it
  // runs after Expo adds its entitlement, including on a reused native project.
  if (!enabled) {
    config = withEntitlementsPlist(config, result => {
      delete result.modResults['aps-environment'];
      return result;
    });
  }
  // Applying Expo's run-once plugin here also prevents an implicit second pass.
  return withNotifications(config, { color: '#ff0044', defaultChannel: 'spottr' });
};
