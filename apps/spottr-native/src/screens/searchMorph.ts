/** Shared geometry; only the bounded toolbar surfaces change layout. */
// Tune the physical response, not the duration-based solver's fast initial
// travel and long tail. These springs carry velocity across interruptions.
export const searchMorphSpring = { mass: 1, stiffness: 110, damping: 17.6, energyThreshold: 1e-7, overshootClamping: false };
export const searchDismissSpring = { mass: 1, stiffness: 150, damping: 22, energyThreshold: 6e-5, overshootClamping: false };
// One expansion and its restrained landing, without a second late scale.
export const iosSearchOpenSpring = { mass: 1, stiffness: 280, damping: 26.5, energyThreshold: 1e-7, overshootClamping: false };
export const iosSearchCloseSpring = { mass: 1, stiffness: 430, damping: 34, energyThreshold: 6e-5, overshootClamping: false };
export const iosSearchPressSpring = { mass: 1, stiffness: 650, damping: 35, overshootClamping: true };
export const iosSearchPressExpansion = 3;
export const iosSearchSourceHandoff = .035;
export const iosSearchControlsReturn = .4;
// A missing native focus acknowledgement must never strand the toolbar.
export const iosSearchFocusFallbackMs = 120;
export function morphPhase(value: number, start = 0, end = 1) {
  'worklet';
  return Math.max(0, Math.min(1, (value - start) / (end - start)));
}
export function smoothMorphPhase(value: number, start: number, end: number) {
  'worklet';
  const p = morphPhase(value, start, end);
  return p * p * (3 - 2 * p);
}
export type SearchBounds = { x: number; y: number; width: number; height: number };
export type SearchMorphBounds = { source: SearchBounds; destination: SearchBounds };

/** Bootstrap only; permanent layout anchors replace these before interaction. */
export function initialSearchBounds(rowWidth: number): SearchMorphBounds {
  const switchWidth = Math.min(152, Math.max(112, rowWidth - 104));
  return {
    source: { x: switchWidth + 60, y: 0, width: 44, height: 44 },
    destination: { x: 52, y: 0, width: Math.max(44, rowWidth - 52), height: 44 },
  };
}
export function searchMorphGeometry(bounds: SearchMorphBounds, value: number, textWidth = 144,
  motion: { opening: boolean; interactive: boolean; reduced: boolean; ios?: boolean; pressExpansion?: number; pressProgress?: number } = { opening: true, interactive: false, reduced: false }) {
  'worklet';
  const p = morphPhase(value), { source, destination } = bounds;
  const elastic = !motion.reduced && !motion.interactive;
  const nativeOvershoot = motion.ios && elastic ? Math.min(.02, 6 / destination.width, Math.max(0, value - 1)) : 0;
  // The controls and Search circle share the closing spring's final lobe.
  // No delayed entrance or second spring; a held keyboard drag stays direct.
  const nativeReturnSettle = motion.ios && elastic ? Math.max(0, -value) : 0;
  // Keep the established measured path; visibility has its own overlapping
  // phases, so controls can retreat and return without a last-frame swap.
  const travel = motion.ios ? p + nativeOvershoot : morphPhase(p, .18, 1);
  // The source press and travelling material share the same extent at launch.
  // UIKit still renders the glass, without a competing press deformation.
  const launch = motion.ios && !motion.reduced ? Math.max(0, Math.min(iosSearchPressExpansion, motion.pressExpansion ?? 0)) : 0;
  const heldPress = motion.ios && elastic ? Math.max(launch,
    motion.opening ? 0 : iosSearchPressExpansion * morphPhase(motion.pressProgress ?? 0)) : 0;
  const expansion = launch * (1 - p) ** 3;
  // Carry a small amount of the press into the stretch. Relax it during the
  // same expansion, without holding an inflated shape before the morph.
  const thickness = launch * (1 - smoothMorphPhase(p, .12, 1));
  const height = source.height + (destination.height - source.height) * travel + thickness;
  const searchWidth = source.width + (destination.width - source.width) * travel + expansion;
  const searchX = source.x + (destination.x - source.x) * travel - expansion / 2;
  const searchY = source.y + (destination.y - source.y) * travel - thickness / 2;
  // Measure the text, capped to the input's fixed viewport. Hide it while
  // there is still room for its trailing glyph/caret, not after clipping starts.
  const textFits = Math.min(textWidth, Math.max(0, destination.width - 76)) + 44;
  const controlsEnd = motion.ios ? iosSearchControlsReturn : .42;
  const controls = 1 - smoothMorphPhase(p, 0, controlsEnd);
  // Back occupies the switch's footprint: its material must be gone before
  // the returning controls become visible, even when a gesture reverses.
  const back = smoothMorphPhase(p, controlsEnd, motion.ios ? .68 : .78);
  const entrance = smoothMorphPhase(p, .42, .97);
  const nativeBackScale = .93 + .07 * smoothMorphPhase(p, .22, 1)
    + nativeOvershoot;
  const backScale = motion.reduced ? 1 : motion.ios ? nativeBackScale : entrance === 1 ? 1 : motion.opening && !motion.interactive
    ? (entrance < .7 ? .93 + .105 * smoothMorphPhase(entrance, 0, .7) : 1.035 - .035 * smoothMorphPhase(entrance, .7, 1))
    : .93 + .07 * back;
  return {
    searchX, searchY,
    searchWidth,
    searchHeight: height,
    contentWidth: destination.width,
    radius: height / 2,
    iconX: -4 * travel + expansion / 2,
    iconY: thickness / 2,
    text: smoothMorphPhase(searchWidth, textFits, Math.min(destination.width, textFits + 44))
      * (motion.ios ? smoothMorphPhase(p, .4, 1) : 1),
    clear: smoothMorphPhase(searchWidth, destination.width - 12, destination.width),
    controls, back, backScale,
    // Hold the released press while the existing responder preparation runs;
    // hand it directly to the morph instead of shrinking before expansion.
    sourcePressScale: 1 + heldPress / source.height * (1 - smoothMorphPhase(p, 0, iosSearchSourceHandoff)),
    controlsScale: motion.reduced ? 1 : motion.ios ? .96 + .04 * controls + Math.min(.016, nativeReturnSettle * 1.45) : .88 + .12 * controls,
    controlsTranslateY: motion.ios && !motion.reduced ? 4 * (1 - controls) : 0,
    // Subtract the travelling capsule, with 1px clearance, from the source
    // group's 8px-padded mask. A rectangular wipe cut the Filter in half.
    controlsCutout: { x: searchX + 7, y: searchY + 7, width: searchWidth + 2, height: height + 2, rx: height / 2 + 1 },
    // Anchor the field's left edge: the overshoot uses at most 6px of the
    // existing 20px screen inset and never approaches the Back button.
    fieldScaleX: 1 + (!motion.ios && elastic && motion.opening ? Math.min(.015, 6 / destination.width, Math.max(0, value - 1)) : 0),
    fieldScaleY: 1 + nativeOvershoot,
    // The permanently mounted destination matches the same overshooting
    // bounds as the travelling surface, including during a rapid reversal.
    destinationScaleX: 1 + (destination.width - source.width) * nativeOvershoot / destination.width,
    destinationOffsetX: (destination.x - source.x) * nativeOvershoot,
    // The negative lobe of the existing closing spring supplies the rebound.
    // Do not start a second animation or drop this extent on a rapid reopen.
    sourceScale: 1 + (elastic ? motion.ios ? Math.min(.035, nativeReturnSettle * 3.1)
      : !motion.opening ? Math.min(.01, Math.max(0, -value)) : 0 : 0),
  };
}
export function keyboardMorphProgress(value: number, keyboardFrom: number, target: number, morphFrom: number) {
  'worklet';
  const distance = target - keyboardFrom;
  const travel = Math.abs(distance) < .001 ? 1 : morphPhase((value - keyboardFrom) / distance);
  return morphFrom + (target - morphFrom) * travel;
}
