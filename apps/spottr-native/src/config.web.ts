import { REMOTE_API_URL } from "./config.shared";
import { isMetroWebPreview } from './config.webPreview';
export { WEB_URL, PAGE_SIZE } from "./config.shared";

// The proxy exists only in the Expo development server, never in a static export.
const metroPreview = typeof document !== 'undefined' &&
  isMetroWebPreview(Array.from(document.scripts, script => script.src), location.origin);
export const API_URL = __DEV__ || metroPreview ? "/api/v1" : REMOTE_API_URL;
