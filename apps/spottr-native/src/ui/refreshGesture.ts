export const REFRESH_PULL_THRESHOLD = 96;
export const REFRESH_LOADING_OFFSET = 64;

/** Leave ordinary scrolling, horizontal rails and taps to the browser. */
export function refreshPullIntent(x: number, y: number): 'pending' | 'pull' | 'scroll' {
  if (Math.max(Math.abs(x), Math.abs(y)) < 8) return 'pending';
  if (y >= 8 && y > Math.abs(x) * 1.15) return 'pull';
  if (y <= -8 || Math.abs(x) >= 8 || Math.abs(y) >= 16) return 'scroll';
  return 'pending';
}

export function refreshPullOffset(distance: number): number {
  return Math.min(72, Math.max(0, distance) * 0.45);
}
