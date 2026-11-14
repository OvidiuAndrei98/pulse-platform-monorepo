import { getSvgPath } from 'figma-squircle';

/** Shared squircle contour for web and Android. Preserve the continuous corner
 * transition even when the radius reaches half the surface's height. */
export function continuousCornerPath(width: number, height: number, radius: number) {
  if (![width, height, radius].every(Number.isFinite) || width <= 0 || height <= 0) return '';
  return getSvgPath({
    width,
    height,
    cornerRadius: Math.max(0, Math.min(radius, width / 2, height / 2)),
    cornerSmoothing: 0.6,
    preserveSmoothing: true,
  });
}
