import { Easing, ReduceMotion } from 'react-native-reanimated';

export const tabCapsuleImpactTiming = {
  duration: 65,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
};

/** Close the initial distance under a held finger without slowing direct drags. */
export const tabCapsulePickupSpring = {
  stiffness: 300,
  damping: 30,
  mass: 1,
  reduceMotion: ReduceMotion.System,
};

export const tabCapsuleSpring = {
  stiffness: 240, damping: 23, mass: 1, reduceMotion: ReduceMotion.System,
};
export const tabCapsulePressSpring = {
  stiffness: 600, damping: 26, mass: 0.55, reduceMotion: ReduceMotion.System,
};
export const tabCapsuleReleaseSpring = {
  stiffness: 450, damping: 18, mass: 0.65, reduceMotion: ReduceMotion.System,
};
