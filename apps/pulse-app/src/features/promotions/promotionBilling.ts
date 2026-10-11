import {
  emptyInvoiceDetails,
  getInvoiceFieldErrors,
  isBucharestAddress as invoiceIsBucharest,
  type InvoiceDetails,
} from "../checkout/invoiceDetails";

export type PromotionBillingDetails = Pick<
  InvoiceDetails,
  "registrationNumber" | "address" | "city" | "county" | "sector" | "country"
>;
export type PromotionBillingFieldErrors = Partial<
  Record<keyof PromotionBillingDetails, string>
>;
export const emptyPromotionBillingDetails = (
  fiscalAddress = "",
): PromotionBillingDetails => ({
  registrationNumber: "",
  address: fiscalAddress,
  city: "",
  county: "",
  sector: "",
  country: "Romania",
});
export const normalizedCUI = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, "").replace(/^RO/, "");
export const promotionBillingFromSaved = (
  details: InvoiceDetails,
): PromotionBillingDetails => ({
  registrationNumber: details.registrationNumber,
  address: details.address,
  city: details.city,
  county: details.county,
  sector: details.sector,
  country: details.country,
});
export const savedCompanyBilling = (
  details: PromotionBillingDetails,
  profile: { companyName: string; cui: string },
): InvoiceDetails => ({
  type: "company",
  name: profile.companyName,
  taxId: profile.cui,
  ...details,
});
export const isPromotionBucharestAddress = (details: PromotionBillingDetails) =>
  invoiceIsBucharest({ ...emptyInvoiceDetails(), ...details });
export function getPromotionBillingFieldErrors(
  details: PromotionBillingDetails,
): PromotionBillingFieldErrors {
  // Promotion buyer identity comes from the verified company, not editable fields.
  const errors = getInvoiceFieldErrors({
    ...emptyInvoiceDetails("Organizer"),
    ...details,
  });
  const result: PromotionBillingFieldErrors = {};
  for (const key of Object.keys(details) as (keyof PromotionBillingDetails)[])
    if (errors[key]) result[key] = errors[key];
  return result;
}
export const validatePromotionBillingDetails = (
  details: PromotionBillingDetails,
) => Object.values(getPromotionBillingFieldErrors(details))[0] ?? null;
