/** Metro also serves optimized bundles with dev=false. A static export never
 * uses this URL format, so it must keep calling the configured remote API. */
export function isMetroWebPreview(sources: readonly string[], origin: string): boolean {
  return sources.some(source => {
    try {
      const url = new URL(source, origin);
      return url.origin === origin && url.pathname.endsWith('.bundle') &&
        url.searchParams.get('platform') === 'web' && url.searchParams.has('dev');
    } catch { return false; }
  });
}
