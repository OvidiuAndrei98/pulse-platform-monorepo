import { Easing, ReduceMotion, withSpring, type SpringAnimation } from 'react-native-reanimated';

export const tabCapsuleImpactTiming = {
  duration: 65,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
};

/** Close the initial distance when picking up the capsule. */
export const tabCapsulePickupSpring = {
  stiffness: 300,
  damping: 30,
  mass: 1,
  reduceMotion: ReduceMotion.System,
};

/** Light cushioning while dragging, with only a small gap behind the finger. */
export const tabCapsuleFollowSpring = {
  stiffness: 480,
  damping: 32,
  mass: 0.55,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
};

export const tabCapsuleSpring = {
  stiffness: 240, damping: 23, mass: 1, reduceMotion: ReduceMotion.System,
};

// Navbar travel only: preserve the existing segmented controls and dragging.
// A full traversal settles in roughly a quarter second with a restrained tail.
const tabTravelSpring = {
  stiffness: 400, damping: 34, mass: 1, reduceMotion: ReduceMotion.System,
};

/** Retarget the numeric capsule spring without braking at each reversal.
 * Reanimated 4.7's spring clips velocity pointing away from a new destination.
 * For this travelling object, preserve that velocity and let the spring turn
 * it around. Keep the library's solver, frame scheduling and reduced motion. */
export function withTabTravel(target: number, distanceInTabs = 1): number {
  'worklet';
  // Soften travel by 5%, retaining the extra glide over intervening tabs
  // and the same damping ratio and restrained tail.
  // Scaling mass and damping together stretches one spring, without a second
  // animation, extra overshoot or a delay before navigation.
  const timeScale = 1.05 * (1 + Math.min(2, Math.max(0, distanceInTabs - 1)) * 0.12);
  const config = {
    ...tabTravelSpring,
    mass: tabTravelSpring.mass * timeScale * timeScale,
    damping: tabTravelSpring.damping * timeScale,
  };
  const animation = withSpring(target, config) as unknown as SpringAnimation;
  const start = animation.onStart;
  animation.onStart = (current, value, now, previous) => {
    'worklet';
    const velocity = previous?.lastTimestamp ? previous.velocity : 0;
    start(current, value, now, previous);
    if (!current.reduceMotion && Number.isFinite(velocity)) {
      current.velocity = velocity;
      current.initialEnergy += 0.5 * config.mass * velocity * velocity;
    }
  };
  return animation as unknown as number;
}
export const tabCapsulePressSpring = {
  stiffness: 600, damping: 26, mass: 0.55, reduceMotion: ReduceMotion.System,
};
export const tabCapsuleReleaseSpring = {
  stiffness: 450, damping: 18, mass: 0.65, reduceMotion: ReduceMotion.System,
};
