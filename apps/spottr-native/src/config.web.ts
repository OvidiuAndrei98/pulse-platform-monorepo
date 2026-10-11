import { REMOTE_API_URL } from "./config.shared";
export { WEB_URL, PAGE_SIZE } from "./config.shared";

// The proxy exists only in the Expo development server, never in a static export.
export const API_URL = __DEV__ ? "/api/v1" : REMOTE_API_URL;
