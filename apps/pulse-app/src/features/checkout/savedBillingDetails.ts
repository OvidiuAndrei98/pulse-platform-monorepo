import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { isNativePlatform } from "@/lib/native/platform";
import type { InvoiceDetails } from "./InvoiceDetailsFields";

const fields = [
  "name",
  "taxId",
  "registrationNumber",
  "address",
  "city",
  "county",
  "sector",
  "country",
] as const;
const storageKey = (userId?: string) =>
  `spottr:billing:v1:${userId ? `user:${userId}` : "guest"}`;

export function parseSavedBillingDetails(
  raw: string | null,
): InvoiceDetails | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (record.type !== "individual" && record.type !== "company") return null;
    if (!fields.every((field) => typeof record[field] === "string"))
      return null;
    // Only restore known address fields; never restore payment or session data.
    return Object.fromEntries([
      ["type", record.type],
      ...fields.map((field) => [field, record[field]]),
    ]) as InvoiceDetails;
  } catch {
    return null;
  }
}

export async function readSavedBillingDetails(userId?: string) {
  const key = storageKey(userId);
  const raw = isNativePlatform()
    ? await SecureStorage.getItem(key)
    : window.localStorage.getItem(key);
  return parseSavedBillingDetails(raw);
}

export async function saveBillingDetails(
  details: InvoiceDetails,
  userId?: string,
) {
  const key = storageKey(userId);
  const value = JSON.stringify(details);
  if (isNativePlatform()) await SecureStorage.setItem(key, value);
  else window.localStorage.setItem(key, value);
}

export async function removeSavedBillingDetails(userId?: string) {
  const key = storageKey(userId);
  if (isNativePlatform()) await SecureStorage.removeItem(key);
  else window.localStorage.removeItem(key);
}
