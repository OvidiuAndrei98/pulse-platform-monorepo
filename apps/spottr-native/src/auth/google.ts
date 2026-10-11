export const GOOGLE_RETURN = 'spottr-native://auth/google/callback';
export function googleLoginUrl(api: string, nonce: string, accountType: 'user' | 'organizer', companyName?: string, cui?: string, previewOrigin?: string) {
  const url = new URL(api.replace(/\/+$/, '') + '/auth/google');
  url.searchParams.set('client', 'native'); url.searchParams.set('clientNonce', nonce); url.searchParams.set('accountType', accountType);
  if (accountType === 'organizer') { url.searchParams.set('companyName', companyName?.trim() ?? ''); url.searchParams.set('cui', cui?.trim() ?? ''); }
  if (previewOrigin && ['http://localhost:8081', 'http://127.0.0.1:8081'].includes(previewOrigin)) url.searchParams.set('previewOrigin', previewOrigin);
  return url.href;
}
export function readGoogleToken(value: string, nonce: string, expected = GOOGLE_RETURN) {
  const url = new URL(value);
  const expectedUrl = new URL(expected);
  if (!([GOOGLE_RETURN, 'http://localhost:8081/auth/google/callback', 'http://127.0.0.1:8081/auth/google/callback'].includes(expected)) || url.protocol !== expectedUrl.protocol || url.host !== expectedUrl.host || url.pathname !== expectedUrl.pathname || url.username || url.password || url.search) throw new Error('INVALID_CALLBACK');
  const params = new URLSearchParams(url.hash.slice(1)), token = params.get('token');
  if (!nonce || params.get('clientNonce') !== nonce || !token || token.length > 16384) throw new Error('INVALID_CALLBACK');
  return token;
}
