/** Expo's development proxy is same-origin, so API images can be exported to canvas. */
export function storyImageSource(uri: string, apiUrl: string, remoteApiUrl: string): string {
  if (!apiUrl.startsWith('/')) return uri;
  try {
    const image = new URL(uri), remote = new URL(remoteApiUrl);
    const prefix = remote.pathname.replace(/\/+$/, '');
    const asset = image.pathname.slice(prefix.length);
    if (image.origin !== remote.origin || image.username || image.password || !image.pathname.startsWith(prefix + '/')) return uri;
    if (!/^\/media\/events\/[0-9a-f-]{36}\/[0-9a-f]+\.(?:jpe?g|png|webp)$/i.test(asset)) return uri;
    return apiUrl.replace(/\/+$/, '') + asset + image.search;
  } catch { return uri; }
}
