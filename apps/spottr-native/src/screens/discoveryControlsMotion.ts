import { morphPhase, smoothMorphPhase } from './searchMorph';

export type DiscoveryControlPose = { opacity: number; scale: number; x: number; y: number };
type Pose = DiscoveryControlPose;
type Controls = { switch: Pose; filter: Pose };
type Mode = 'opening' | 'return' | 'gesture' | 'reverse';
export type DiscoveryControlsState = Controls & {
  mode: Mode; progress: number; minimum: number; anchor: number; correction: Controls;
};
type Frame = {
  progress: number; opening: boolean; interactive: boolean; reduced: boolean; sourceX: number;
  opacity: number; scale: number; y: number;
};

const zero = (): Pose => { 'worklet'; return { opacity: 0, scale: 0, x: 0, y: 0 }; };
export function initialDiscoveryControlsState(open: boolean): DiscoveryControlsState {
  const pose = { opacity: open ? 0 : 1, scale: 1, x: 0, y: 0 };
  return { switch: pose, filter: pose, mode: 'opening', progress: open ? 1 : 0,
    minimum: open ? 1 : 0, anchor: open ? 1 : 0, correction: { switch: zero(), filter: zero() } };
}
function difference(a: Pose, b: Pose): Pose {
  'worklet';
  return { opacity: a.opacity - b.opacity, scale: a.scale - b.scale, x: a.x - b.x, y: a.y - b.y };
}
function offset(pose: Pose, correction: Pose, weight: number): Pose {
  'worklet';
  return { opacity: morphPhase(pose.opacity + correction.opacity * weight),
    scale: pose.scale + correction.scale * weight, x: pose.x + correction.x * weight, y: pose.y + correction.y * weight };
}
function returningPose(p: number, minimum: number, mode: Mode, interactive: boolean): Controls {
  'worklet';
  // On the existing close spring these thresholds are 24ms apart. Opacity
  // completes at its first negative lobe, ~170ms after the switch appears.
  // Keep that opacity on the spring's way back to zero; gestures never latch.
  const alphaProgress = mode === 'return' && p !== 0 ? minimum : p;
  const alphaEnd = mode === 'return' && p !== 0 ? -.011 : 0;
  const reveal = 1 - smoothMorphPhase(p, 0, .4);
  const filterReveal = 1 - smoothMorphPhase(p, 0, .25);
  const settle = interactive ? 0 : Math.max(0, -p);
  return {
    switch: { opacity: 1 - smoothMorphPhase(alphaProgress, alphaEnd, .4),
      scale: .96 + .04 * reveal + .015 * morphPhase(settle, 0, .011), x: 0, y: 5 * (1 - reveal) },
    filter: { opacity: 1 - smoothMorphPhase(alphaProgress, alphaEnd, .25),
      scale: .94 + .06 * filterReveal + .025 * morphPhase(settle, 0, .008), x: 0, y: 3 * (1 - filterReveal) },
  };
}

/** Visual choreography only. No timers, animation clocks, keyboard commands,
 * layout writes or selection state; everything follows the existing morph. */
export function advanceDiscoveryControls(previous: DiscoveryControlsState, frame: Frame): DiscoveryControlsState {
  'worklet';
  const p = frame.progress;
  // Keep the original opening exactly, including the common group's pivot.
  // Flatten that transform into its two children so returning controls can
  // have individual curves while remaining in the same native glass group.
  const opening: Controls = {
    switch: { opacity: frame.opacity, scale: frame.scale, x: -26 * (frame.scale - 1), y: frame.y },
    filter: { opacity: frame.opacity, scale: frame.scale, x: (frame.sourceX / 2 - 26) * (frame.scale - 1), y: frame.y },
  };
  const mode: Mode = frame.reduced ? 'opening' : frame.interactive ? 'gesture' : !frame.opening ? 'return'
    : previous.mode === 'opening' || p >= .4 || previous.progress === 0 ? 'opening' : 'reverse';
  if (mode === 'opening') return { ...opening, mode, progress: p, minimum: p, anchor: p, correction: { switch: zero(), filter: zero() } };
  const changed = previous.mode !== mode;
  const minimum = mode === 'return' ? Math.min(p, changed ? previous.progress : previous.minimum) : p;
  const anchor = changed ? previous.progress : previous.anchor;
  const target = returningPose(p, minimum, mode, frame.interactive);
  const atAnchor = returningPose(anchor, anchor, mode, frame.interactive);
  const correction = changed ? { switch: difference(previous.switch, atAnchor.switch), filter: difference(previous.filter, atAnchor.filter) } : previous.correction;
  // A reversal carries the displayed pose, then rejoins its progress curve.
  // Fading this correction by distance (not time) also preserves slow drags.
  const distance = Math.max(.001, Math.min(.2, mode === 'reverse' ? .4 - anchor : anchor));
  const weight = 1 - smoothMorphPhase(Math.abs(p - anchor), 0, distance);
  return { switch: offset(target.switch, correction.switch, weight), filter: offset(target.filter, correction.filter, weight),
    mode, progress: p, minimum, anchor, correction };
}
