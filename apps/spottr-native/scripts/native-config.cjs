const appLinkPaths = ['/events', '/users', '/profile', '/feed', '/search', '/dashboard', '/admin', '/ticket-validation', '/scan', '/login', '/register', '/forgot-password', '/reset-password', '/legal'];
function linkHosts(value) {
  const hosts = (value || 'spottr.ro,www.spottr.ro,dev.spottr.ro').split(',').map(v => v.trim()).filter(Boolean);
  if (!hosts.length || hosts.some(v => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(v))) throw Error('EXPO_PUBLIC_LINK_HOSTS must contain hostnames only.');
  return [...new Set(hosts)];
}
function associationDocuments({ teamId, fingerprints, bundleId, packageName }) {
  if (teamId && !/^[A-Z0-9]{10}$/.test(teamId)) throw Error('Invalid Apple Team ID.');
  const hashes = (fingerprints || '').split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
  if (hashes.some(v => !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(v))) throw Error('Invalid Android SHA-256 certificate fingerprint.');
  return {
    apple: teamId ? { applinks: { apps: [], details: [{ appID: `${teamId}.${bundleId}`, paths: appLinkPaths.flatMap(path => [path, path + '/*']) }] } } : null,
    android: hashes.length ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: [...new Set(hashes)] } }] : null,
  };
}
function mergeAppleAssociation(previous, entry) {
  const details = (previous.applinks?.details ?? []).flatMap(existing => {
    if (existing.appID === entry.appID) return [];
    if (!existing.appIDs?.includes(entry.appID)) return [existing];
    const appIDs = existing.appIDs.filter(id => id !== entry.appID);
    return appIDs.length ? [{ ...existing, appIDs }] : [];
  });
  return { ...previous, applinks: { ...previous.applinks, apps: previous.applinks?.apps ?? [], details: [...details, entry] } };
}
module.exports = { appLinkPaths, linkHosts, associationDocuments, mergeAppleAssociation };
