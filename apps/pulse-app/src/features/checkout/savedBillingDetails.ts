import { ApiClient } from "@packages/api-client/src/Client";
import type { InvoiceDetails } from "./InvoiceDetailsFields";

export async function readSavedBillingDetails(userId?: string) {
  if (!userId) return null;
  const response = await ApiClient.instance.get("/users/me/billing-details");
  return (response.details ?? null) as InvoiceDetails | null;
}

export async function saveBillingDetails(
  details: InvoiceDetails,
  userId?: string,
) {
  if (!userId) throw new Error("AUTHENTICATED_USER_REQUIRED");
  return ApiClient.instance.put("/users/me/billing-details", {
    body: details,
  }) as Promise<InvoiceDetails>;
}

export async function removeSavedBillingDetails(userId?: string) {
  if (!userId) return;
  await ApiClient.instance.delete("/users/me/billing-details");
}
