export type DropdownAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Keep a field's menu next to its trigger, including near viewport edges. */
export function dropdownPlacement(
  anchor: DropdownAnchor,
  viewport: { width: number; height: number },
  desiredHeight: number,
) {
  const margin = 8,
    gap = 8;
  const width = Math.min(
    anchor.width,
    Math.max(0, viewport.width - margin * 2),
  );
  const below = Math.max(
    0,
    viewport.height - anchor.y - anchor.height - gap - margin,
  );
  const above = Math.max(0, anchor.y - gap - margin);
  const openAbove = below < desiredHeight && above > below;
  const height = Math.max(
    0,
    Math.min(desiredHeight, openAbove ? above : below),
  );
  return {
    left: Math.max(margin, Math.min(anchor.x, viewport.width - width - margin)),
    top: Math.max(
      margin,
      openAbove ? anchor.y - gap - height : anchor.y + anchor.height + gap,
    ),
    width,
    height,
  };
}
