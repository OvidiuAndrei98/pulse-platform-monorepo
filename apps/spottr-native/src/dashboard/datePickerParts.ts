/** Native date/time dialogs return separate values. Merge their local calendar
 * parts, preserving the other part and never interpreting a wall-clock as UTC. */
export function withPickerDate(value: Date, selected: Date) {
  return new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(), value.getHours(), value.getMinutes(), 0, 0);
}

export function withPickerTime(value: Date, selected: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), selected.getHours(), selected.getMinutes(), 0, 0);
}

/** Native wheels edit local parts; clamp short months instead of overflowing
 * 31 January into March, or 29 February into the next month in a non-leap year. */
export function withPickerParts(value: Date, parts: { year?: number; month?: number; day?: number; hours?: number; minutes?: number }) {
  const year = parts.year ?? value.getFullYear();
  const month = parts.month ?? value.getMonth();
  const day = Math.min(parts.day ?? value.getDate(), new Date(year, month + 1, 0).getDate());
  return new Date(year, month, day, parts.hours ?? value.getHours(), parts.minutes ?? value.getMinutes(), 0, 0);
}
