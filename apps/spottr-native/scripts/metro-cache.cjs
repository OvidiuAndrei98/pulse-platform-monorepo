// Keep Expo's binary cache, keys and directory; only bound simultaneous I/O.
function limitCacheIO(stores, maxConcurrent = 32) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) throw new RangeError('Invalid cache concurrency');
  let active = 0;
  const waiting = [];

  async function run(operation) {
    if (active >= maxConcurrent) await new Promise(resolve => waiting.push(resolve));
    else active++;
    // Awaiting a slot here preserves the caller's async context (used by Expo's
    // cache variants). Invoking queued operations from another task would not.
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await operation();
        } catch (error) {
          // Other filesystem work can briefly exhaust descriptors as well.
          // Retry only descriptor pressure, finitely; real failures still surface.
          if (!['EMFILE', 'ENFILE'].includes(error?.code) || attempt >= 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
        }
      }
    } finally {
      // Hand the occupied slot directly to the next waiter, without letting a
      // newly arriving request overtake it or exceed the limit.
      if (waiting.length) waiting.shift()();
      else active--;
    }
  }

  return stores.map(store => ({
    get: key => run(() => store.get(key)),
    set: (key, value) => run(() => store.set(key, value)),
    // Metro clears stores before starting a build; retain its synchronous API.
    clear: () => store.clear(),
  }));
}

module.exports = { limitCacheIO };
