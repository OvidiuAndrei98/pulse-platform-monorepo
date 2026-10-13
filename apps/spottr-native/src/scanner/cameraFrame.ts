/** Use the actual camera viewport, including the space left by scan feedback. */
export function scannerFrameSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
  return Math.max(0, Math.min(340, Math.min(width, height) * 0.76));
}
