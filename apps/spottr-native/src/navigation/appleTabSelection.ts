/** UIKit owns selection immediately. Route acknowledgements must not replay
 * older selections over a newer native tap or drag. */
export function createAppleTabSelection(initialIndex: number) {
  let nativeIndex = initialIndex;
  let confirmedIndex = initialIndex;
  let pending: number[] = [];
  return {
    begin(index: number) {
      nativeIndex = index;
      pending.push(index);
    },
    acknowledge(index: number) {
      confirmedIndex = index;
      const previousRequest = pending.indexOf(index);
      if (previousRequest >= 0) {
        pending.splice(0, previousRequest + 1);
        return false;
      }
      if (index === nativeIndex) return false;
      // Navigation from another control, including native stack Back.
      nativeIndex = index;
      pending = [];
      return true;
    },
    reject() {
      pending = [];
      nativeIndex = confirmedIndex;
      return nativeIndex;
    },
  };
}
