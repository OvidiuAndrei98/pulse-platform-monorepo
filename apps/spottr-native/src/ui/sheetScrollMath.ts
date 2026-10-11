/** Allocate one continuous vertical gesture to the content first, then the sheet. */
export function splitSheetDrag(translation: number, initialScroll: number, initialGap: number, maxScroll: number) {
  if (initialGap > 0) {
    // A handle drag can leave the sheet partially open with scrolled content.
    // Keep that scroll locked until the sheet returns to its expanded position.
    const remaining = initialGap + translation;
    return {
      scroll: Math.min(Math.max(0, maxScroll), Math.max(0, initialScroll - Math.min(0, remaining))),
      sheetTranslation: Math.max(0, remaining) - initialGap,
    };
  }
  const balance = translation + Math.max(0, initialGap) - Math.max(0, initialScroll);
  return {
    scroll: Math.min(Math.max(0, maxScroll), Math.max(0, -balance)),
    sheetTranslation: Math.max(0, balance) - Math.max(0, initialGap),
  };
}
