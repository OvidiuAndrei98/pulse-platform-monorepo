import { getTabCapsuleFrame, getTabFreeCapsuleFrame } from './tabCapsuleGeometry';

export type TabMotionLayout = { width: number; spacing: number; limit: number; firstCenter: number; blobWidth: number };
export type TabMotionPose = {
  barX: number; barScaleX: number; barScaleY: number;
  trackX: number; trackScaleX: number; trackScaleY: number;
  indicatorX: number; indicatorScaleX: number; indicatorScaleY: number;
};
export type TabMotionState = {
  x: number; velocity: number; timestamp: number; from: number; target: number;
  energy: number; omega: number; phase: number; width: number; spacing: number;
  start: TabMotionPose; pose: TabMotionPose;
};

function smooth(value: number) {
  'worklet';
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function restingPose(x: number, layout: TabMotionLayout, interaction = 0): TabMotionPose {
  'worklet';
  const indicator = getTabFreeCapsuleFrame(x, layout.limit, layout.blobWidth, interaction, 0);
  return { barX: 0, barScaleX: 1, barScaleY: 1, trackX: 0, trackScaleX: 1, trackScaleY: 1,
    indicatorX: indicator.translateX, indicatorScaleX: indicator.scaleX, indicatorScaleY: indicator.scaleY };
}

function contactFrame(x: number, layout: TabMotionLayout) {
  'worklet';
  const overflow = Math.max(0, -x, x - layout.limit);
  const side = x < 0 ? -1 : x > layout.limit ? 1 : 0;
  const overrun = overflow / (1 + overflow / 6);
  // Slightly more visible surface/icon yield; the inverse center transform
  // below preserves the capsule's existing screen-space travel and recoil.
  const pull = 1.2 * overrun * overrun / (overrun + 0.2);
  const strain = layout.limit > 0 ? pull / layout.limit : 0;
  const visibleX = side ? (side < 0 ? -overrun : layout.limit + overrun) : x;
  return { strain, barX: side * strain * (layout.width / 2 - layout.firstCenter),
    scaleY: 1 - strain * 0.1,
    center: (visibleX + (side < 0 ? pull : 0)) / (1 + strain) };
}

export function idleTabMotion(x: number, layout: TabMotionLayout, now = 0): TabMotionState {
  'worklet';
  const pose = restingPose(x, layout);
  return { x, velocity: 0, timestamp: now, from: x, target: x, energy: 0, omega: 20, phase: 1,
    width: layout.width, spacing: layout.spacing, start: pose, pose };
}

/** A retarget captures the displayed pose. No deformation is reset/replayed. */
export function startTabMotion(state: TabMotionState, x: number, target: number, layout: TabMotionLayout, now: number): TabMotionState {
  'worklet';
  // A stationary drag release must retain its grip scale until the existing
  // interaction spring releases it. It must not flash to an unpressed pose.
  if (Math.abs(target - x) < 0.00001) {
    const idle = idleTabMotion(x, layout, now);
    return { ...idle, start: state.pose, pose: state.pose };
  }
  const distance = Math.abs(target - x) / Math.max(1, layout.spacing);
  const timeScale = 1.05 * (1 + Math.min(2, Math.max(0, distance - 1)) * 0.12);
  const omega = 20 / timeScale;
  const velocity = now - state.timestamp <= 100 ? state.velocity : 0;
  const start = state.width === layout.width && state.spacing === layout.spacing ? state.pose : restingPose(x, layout);
  return { x, velocity, timestamp: now, from: x, target, energy: Math.hypot(target - x, velocity / omega), omega,
    phase: 0, width: layout.width, spacing: layout.spacing, start, pose: start };
}

/** One position sample produces all three transform groups. This function
 * starts no animations: the existing position spring is the only free driver. */
export function advanceTabMotion(state: TabMotionState, x: number, layout: TabMotionLayout, now: number,
  interaction: number, held: boolean, reduced: boolean): TabMotionState {
  'worklet';
  if (reduced || state.width !== layout.width || state.spacing !== layout.spacing) return idleTabMotion(x, layout, now);
  const moved = x !== state.x;
  const elapsed = now - state.timestamp;
  const velocity = moved && elapsed > 0 && elapsed <= 250 ? (x - state.x) * 1000 / Math.max(1000 / 120, elapsed) : state.velocity;
  if (held) {
    const overflow = Math.max(0, -x, x - layout.limit);
    const side = x < 0 ? -1 : 1;
    const extension = Math.min(1, overflow / 8) * 3;
    const barX = side * extension / 2, barScaleX = layout.width > 0 ? 1 + extension / layout.width : 1;
    const indicator = getTabCapsuleFrame(x, layout.limit, layout.blobWidth, interaction, 0, side, extension);
    const pose = { barX, barScaleX, barScaleY: 1, trackX: -barX / barScaleX, trackScaleX: 1 / barScaleX, trackScaleY: 1,
      indicatorX: indicator.translateX, indicatorScaleX: indicator.scaleX, indicatorScaleY: indicator.scaleY };
    return { ...state, x, velocity, timestamp: moved ? now : state.timestamp, pose };
  }
  const finished = Math.abs(x - state.target) < 0.00001;
  const remaining = Math.hypot(state.target - x, velocity / state.omega);
  const phase = finished || state.energy < 0.00001 ? 1
    : Math.max(state.phase, Math.max(0, Math.min(1, 1 - remaining / state.energy)));
  const blend = smooth(phase / 0.45), carry = 1 - blend;
  const distance = layout.limit > 0 ? Math.min(1, Math.abs(state.target - state.from) / layout.limit) : 0;
  // The position spring itself pushes the surface. There is no second contact
  // curve, even one evaluated from the same phase: that still looks detached.
  // Softly bound extreme reversals, retaining an identity derivative at contact.
  const surface = contactFrame(x, layout), initial = contactFrame(state.from, layout);
  const compression = phase > 0 && phase < 1 ? 0.055 * distance * Math.sin(Math.PI * phase) : 0;
  const indicator = getTabFreeCapsuleFrame(x, layout.limit, layout.blobWidth, interaction, compression);
  // Invert the surface transform for the travelling center. Its screen-space
  // path stays the position spring's path; it never adds a late lateral kick.
  const barScaleY = surface.scaleY + (state.start.barScaleY - initial.scaleY) * carry;
  const pose: TabMotionPose = {
    barX: surface.barX + (state.start.barX - initial.barX) * carry,
    barScaleX: 1 + surface.strain + (state.start.barScaleX - 1 - initial.strain) * carry, barScaleY,
    trackX: state.start.trackX * carry, trackScaleX: 1 + (state.start.trackScaleX - 1) * carry, trackScaleY: 1 / barScaleY,
    indicatorX: surface.center + (state.start.indicatorX - initial.center) * carry,
    indicatorScaleX: state.start.indicatorScaleX * carry + indicator.scaleX * blend,
    indicatorScaleY: state.start.indicatorScaleY * carry + indicator.scaleY * blend,
  };
  return { ...state, x, velocity: finished ? 0 : velocity, timestamp: moved || finished ? now : state.timestamp, phase, pose };
}
