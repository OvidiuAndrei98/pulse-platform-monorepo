// Temporary, local-only instrumentation for the iPhone scroll reset. Keep only
// numeric layout/gesture measurements: never event text, account data or tokens.
export type SheetScrollSample = {
  phase: 'begin' | 'release' | 'momentum-begin' | 'momentum-end' | 'lock';
  y: number;
  contentHeight: number;
  viewportHeight: number;
  insetTop: number;
  insetBottom: number;
  targetY?: number;
  velocityY?: number;
  position: number;
  highest?: number;
  locked: boolean;
  atOpen: boolean;
  handleState: number;
  contentState: number;
  animationStatus: number;
  sheetState: number;
  localOffset: number;
  panOffset: number;
  lockY?: number;
};

const fields = ['y', 'contentHeight', 'viewportHeight', 'insetTop', 'insetBottom', 'targetY', 'velocityY', 'position', 'highest', 'handleState', 'contentState', 'animationStatus', 'sheetState', 'localOffset', 'panOffset', 'lockY'] as const;

export function createSheetScrollDiagnostics(now = Date.now) {
  const samples: Record<string, unknown>[] = [];
  let started: number | undefined;
  return {
    record(sample: SheetScrollSample) {
      const time = now();
      started ??= time;
      const entry: Record<string, unknown> = { ms: time - started, phase: sample.phase, locked: sample.locked, atOpen: sample.atOpen };
      for (const field of fields) {
        const value = sample[field];
        // Preserve subpixel differences: a rounded snap position would hide
        // the exact-equality issue this trace must be able to rule out.
        if (typeof value === 'number' && Number.isFinite(value)) entry[field] = value;
      }
      samples.push(entry);
      if (samples.length > 48) samples.shift();
    },
    report() {
      return JSON.stringify({ diagnostic: 'spottr-sheet-scroll-2026-10-12-b', samples }, null, 2);
    },
  };
}

const diagnostics = createSheetScrollDiagnostics();
export const recordSheetScroll = diagnostics.record;
export const getSheetScrollReport = diagnostics.report;
