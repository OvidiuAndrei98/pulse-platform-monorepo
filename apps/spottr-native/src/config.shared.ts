export const REMOTE_API_URL = (
  process.env.EXPO_PUBLIC_API_URL || "https://api.spottr.ro/api/v1"
).replace(/\/+$/, "");
export const WEB_URL = (
  process.env.EXPO_PUBLIC_WEB_URL || "https://spottr.ro"
).replace(/\/+$/, "");
export const PAGE_SIZE = 20;
// Same build variable used by app.config.js for the OS link associations.
export const APP_LINK_PREFIXES = (process.env.EXPO_PUBLIC_LINK_HOSTS || 'spottr.ro,www.spottr.ro,dev.spottr.ro')
  .split(',').map((host: string) => 'https://' + host.trim()).filter((value: string) => value !== 'https://');
