export type InvoiceDetails = {
  type: "individual" | "company";
  name: string;
  taxId: string;
  registrationNumber: string;
  address: string;
  city: string;
  county: string;
  sector: string;
  country: string;
};

export const emptyInvoiceDetails = (name = ""): InvoiceDetails => ({
  type: "individual",
  name,
  taxId: "",
  registrationNumber: "",
  address: "",
  city: "",
  county: "",
  sector: "",
  country: "Romania",
});

const withoutDiacritics = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export const isBucharestAddress = (details: InvoiceDetails) => {
  const city = withoutDiacritics(details.city);
  const country = withoutDiacritics(details.country);
  return (country === "romania" || country === "ro") && (city === "bucuresti" || city === "bucharest");
};

export type InvoiceFieldErrors = Partial<Record<keyof InvoiceDetails, string>>;

// Both saving a billing profile and purchasing must accept these values.
export const invoiceFieldLimits: Record<keyof InvoiceDetails, number> = {
  type: 10, name: 200, taxId: 32, registrationNumber: 64, address: 300,
  city: 100, county: 100, sector: 16, country: 64,
};

export function getInvoiceFieldErrors(details: InvoiceDetails): InvoiceFieldErrors {
  const errors: InvoiceFieldErrors = {};
  for (const key of Object.keys(invoiceFieldLimits) as (keyof InvoiceDetails)[]) {
    const bytes = Array.from(details[key].trim()).reduce((n, char) => {
      const point = char.codePointAt(0)!;
      return n + (point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4);
    }, 0);
    if (bytes > invoiceFieldLimits[key]) errors[key] = "feedback.fieldTooLong";
  }
  if (details.name.trim().length < 2) errors.name = "checkout.invoiceNameRequired";
  if (details.type === "company" && !details.taxId.trim()) {
    errors.taxId = "checkout.invoiceTaxIdRequired";
  }
  for (const field of ["address", "city", "country"] as const) {
    if (!details[field].trim()) errors[field] = "feedback.fieldRequired";
  }
  if (isBucharestAddress(details) && !/^Sector [1-6]$/i.test(details.sector.trim())) errors.sector = "checkout.invoiceSectorRequired";
  if (!isBucharestAddress(details) && !details.county.trim()) errors.county = "checkout.invoiceCountyRequired";
  return errors;
}

export function validateInvoiceDetails(details: InvoiceDetails): string | null {
  return Object.values(getInvoiceFieldErrors(details))[0] ?? null;
}

