/** Shared geometry; only the bounded toolbar surfaces change layout. */
// Tune the physical response, not the duration-based solver's fast initial
// travel and long tail. These springs carry velocity across interruptions.
export const searchMorphSpring = { mass: 1, stiffness: 110, damping: 17.6, energyThreshold: 1e-7, overshootClamping: false };
export const searchDismissSpring = { mass: 1, stiffness: 150, damping: 22, energyThreshold: 6e-5, overshootClamping: false };
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
  motion = { opening: true, interactive: false, reduced: false }) {
  'worklet';
  const p = morphPhase(value), { source, destination } = bounds;
  // Keep the established measured path; visibility has its own overlapping
  // phases, so controls can retreat and return without a last-frame swap.
  const travel = morphPhase(p, .18, 1);
  const height = source.height + (destination.height - source.height) * travel;
  const searchWidth = source.width + (destination.width - source.width) * travel;
  // Measure the text, capped to the input's fixed viewport. Hide it while
  // there is still room for its trailing glyph/caret, not after clipping starts.
  const textFits = Math.min(textWidth, Math.max(0, destination.width - 76)) + 44;
  const controls = 1 - smoothMorphPhase(p, 0, .42), back = smoothMorphPhase(p, .42, .78);
  const entrance = smoothMorphPhase(p, .42, .97);
  const backScale = motion.reduced || entrance === 1 ? 1 : motion.opening && !motion.interactive
    ? (entrance < .7 ? .93 + .105 * smoothMorphPhase(entrance, 0, .7) : 1.035 - .035 * smoothMorphPhase(entrance, .7, 1))
    : .93 + .07 * back;
  const elastic = !motion.reduced && !motion.interactive;
  return {
    searchX: source.x + (destination.x - source.x) * travel,
    searchY: source.y + (destination.y - source.y) * travel,
    searchWidth,
    searchHeight: height,
    contentWidth: destination.width,
    radius: height / 2,
    iconX: -4 * travel,
    text: smoothMorphPhase(searchWidth, textFits, Math.min(destination.width, textFits + 44)),
    clear: smoothMorphPhase(searchWidth, destination.width - 12, destination.width),
    controls, back, backScale,
    controlsScale: motion.reduced ? 1 : .88 + .12 * controls,
    // Anchor the field's left edge: the overshoot uses at most 6px of the
    // existing 20px screen inset and never approaches the Back button.
    fieldScaleX: 1 + (elastic && motion.opening ? Math.min(.015, 6 / destination.width, Math.max(0, value - 1)) : 0),
    sourceScale: 1 + (elastic && !motion.opening ? Math.min(.01, Math.max(0, -value)) : 0),
  };
}
export function keyboardMorphProgress(value: number, keyboardFrom: number, target: number, morphFrom: number) {
  'worklet';
  const distance = target - keyboardFrom;
  const travel = Math.abs(distance) < .001 ? 1 : morphPhase((value - keyboardFrom) / distance);
  return morphFrom + (target - morphFrom) * travel;
}
