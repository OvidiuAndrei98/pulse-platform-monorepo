// Keep the same key for retries of one payload. A changed purchase is a new intent.
export function checkoutRequestKey(
  previous: { payload: string; key: string } | null,
  payload: string,
) {
  if (previous?.payload === payload) return previous;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return { payload, key: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` };
}
