const PRODUCTION_API_ROOT = "https://api.spottr.ro/api/v1";
const LOCAL_API_ROOT = "http://localhost:8080/api/v1";

// Vercel and native builds may not include a local .env file. Falling back to
// the deployed API keeps an OAuth callback from losing its freshly saved token.
export const apiRoot =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? LOCAL_API_ROOT : PRODUCTION_API_ROOT);
