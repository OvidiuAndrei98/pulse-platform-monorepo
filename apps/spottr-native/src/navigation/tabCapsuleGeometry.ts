// Horizontal proportions only; the spring and glass deformation remain in
// tabCapsuleSpring / FixedCapsuleTabBar. Insets match the existing bar chrome.
export const tabBarInset = 4;
export const tabCapsuleEdgeMargin = tabBarInset + 1;
export const tabCapsuleSpacingRatio = 1.15;

export function tabBarWidthFromSpacing(spacing: number, count: number) {
  return spacing > 0 ? spacing * (count - 1 + tabCapsuleSpacingRatio) + 2 * tabCapsuleEdgeMargin : 0;
}

export function getTabCapsuleGeometry(width: number, count: number) {
  const spacing = count > 1 ? Math.max(0, width - 2 * tabCapsuleEdgeMargin) / (count - 1 + tabCapsuleSpacingRatio) : 0;
  const blobWidth = count > 1 ? spacing * tabCapsuleSpacingRatio : Math.max(0, width - 2 * tabCapsuleEdgeMargin);
  const firstCenter = tabCapsuleEdgeMargin + blobWidth / 2;
  const trackWidth = Math.max(0, width - 2 * tabBarInset);
  const tabs = Array.from({ length: count }, (_, index) => {
    const center = firstCenter + index * spacing;
    // Touch cells meet at the midpoints, independently of the wider visual blob.
    const left = index === 0 ? 0 : center - spacing / 2 - tabBarInset;
    const right = index === count - 1 ? trackWidth : center + spacing / 2 - tabBarInset;
    return { center, left, width: right - left, iconOffset: center - tabBarInset - (left + right) / 2 };
  });
  return { width, trackWidth, spacing, blobWidth, firstCenter, blobLeft: tabCapsuleEdgeMargin - tabBarInset, limit: Math.max(0, (count - 1) * spacing), tabs };
}

/** Identity through the travel, with a C1-continuous tail inside either edge.
 * This only projects rare extreme overshoots into available glass space. It
 * never changes the spring, its velocity, the blob width or its deformation.
 */
export function containTabCapsule(value: number, lower: number, upper: number, softness = 1.5) {
  'worklet';
  const tail = Math.min(softness, (upper - lower) / 4);
  if (value < lower + tail) {
    const excess = lower + tail - value;
    return lower + tail - excess * tail / (tail + excess);
  }
  if (value > upper - tail) {
    const excess = value - upper + tail;
    return upper - tail + excess * tail / (tail + excess);
  }
  return value;
}

export function getTabCapsuleFrame(position: number, limit: number, blobWidth: number, interaction: number, response: number, direction: number, extension: number) {
  'worklet';
  const pressure = Math.min(1, Math.max(0, -position, position - limit) / 8);
  const contact = Math.max(0, 1 - Math.max(0, Math.min(position, limit - position)) / 12);
  const scaleX = 1 + interaction * 0.08 * (1 - pressure) - pressure * 0.05 + response * 0.045;
  const scaleY = 1 + interaction * 0.04 + pressure * 0.025 - response * 0.015;
  const growth = blobWidth * (scaleX - 1) / 2;
  // Account for the existing glass edge extension and center-origin scale.
  // Leave a sub-point clearance even under a held, extreme edge pull.
  const lower = -tabCapsuleEdgeMargin + growth - (direction < 0 ? extension : 0) + 0.5;
  const upper = limit + tabCapsuleEdgeMargin - growth + (direction > 0 ? extension : 0) - 0.5;
  const softness = Math.min(1.5, Math.max(0.1, Math.min(-lower, upper - limit) / 2));
  return { translateX: containTabCapsule(position + direction * extension * contact, lower, upper, softness), scaleX, scaleY };
}
