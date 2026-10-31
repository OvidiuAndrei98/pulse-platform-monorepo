const { flushSync } = require('react-dom') as { flushSync: (update: () => void) => void };

// Safari requires focus inside the trusted activation. Commit editability and
// accessibility visibility first, without deferring focus to an animation frame.
export function commitSearchFocus(update: () => void) { flushSync(update); }
