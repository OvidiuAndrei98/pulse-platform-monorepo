/** Keep the transformed capsule inside its padded track, including spring overshoot. */
export function capsuleSwitchGeometry(position: number, target: number, pressure: number, impact: number, itemWidth: number, count: number, reduced = false) {
  'worklet';
  const last = Math.max(0, count - 1);
  const overflow = Math.min(1, Math.max(0, -position, position - last) / .08);
  const travel = Math.min(1, Math.abs(target - position));
  const scaleX = reduced ? 1 : Math.min(Math.max(1, count), 1 + pressure * .02 + travel * .012 - overflow * .025 - impact * .012);
  const scaleY = reduced ? 1 : 1 + pressure * .012 + overflow * .012 + impact * .008;
  const halfGrowth = itemWidth * (scaleX - 1) / 2;
  const x = Math.max(halfGrowth, Math.min(last * itemWidth - halfGrowth, position * itemWidth));
  return { x, scaleX, scaleY };
}

export function capsuleSwitchDrop(position: number, velocityInTabs: number, count: number) {
  'worklet';
  const projected = position + Math.max(-.3, Math.min(.3, velocityInTabs * .08));
  return Math.max(0, Math.min(count - 1, Math.round(projected)));
}
