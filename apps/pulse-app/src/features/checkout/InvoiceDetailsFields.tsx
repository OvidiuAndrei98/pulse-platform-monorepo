"use client";

import { ReceiptText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ThemedSelect } from "@/features/events/form/ThemedSelect";

import { invoiceFieldLimits, isBucharestAddress, type InvoiceDetails, type InvoiceFieldErrors } from "./invoiceDetails";
import {Input as UIInput} from '@/components/ui/Field';
export { emptyInvoiceDetails, getInvoiceFieldErrors, isBucharestAddress, validateInvoiceDetails } from "./invoiceDetails";
export type { InvoiceDetails, InvoiceFieldErrors } from "./invoiceDetails";

export function InvoiceDetailsFields({
  value,
  onChange,
  idPrefix,
  errors = {},
}: {
  value: InvoiceDetails;
  onChange: (value: InvoiceDetails) => void;
  idPrefix: string;
  errors?: InvoiceFieldErrors;
}) {
  const { t } = useTranslation();
  const update = (field: keyof InvoiceDetails, fieldValue: string) =>
    onChange({ ...value, [field]: fieldValue });
  const inputClass =
    "h-11 w-full transition placeholder:text-white/35 sm:text-sm";
  const errorProps = (field: keyof InvoiceDetails, suffix: string) => ({
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field] ? `${idPrefix}-billing-${suffix}-error` : undefined,
  });
  const bucharest = isBucharestAddress(value);
  const sectors = Array.from({ length: 6 }, (_, index) => ({
    value: `Sector ${index + 1}`,
    label: `Sector ${index + 1}`,
  }));

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
      <div className="flex items-start gap-3">
        <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">{t("checkout.billingDetailsTitle")}</span>
          <span className="mt-1 block text-xs leading-5 text-white/50">
            {t("checkout.invoiceAutomaticHint")}
          </span>
        </span>
      </div>

      <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/25 p-1">
            {(["individual", "company"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ ...value, type })}
                className={`h-9 rounded-lg text-xs font-semibold transition ${
                  value.type === type
                    ? "bg-[var(--ui-action)] text-primary-foreground"
                    : "text-white/55 hover:bg-white/5 hover:text-white"
                }`}
              >
                {t(`checkout.invoiceType.${type}`)}
              </button>
            ))}
          </div>

          <Field label={t(value.type === "company" ? "checkout.companyName" : "checkout.fullName")} htmlFor={`${idPrefix}-billing-name`} error={errors.name}>
            <UIInput
              id={`${idPrefix}-billing-name`} {...errorProps("name", "name")}
              value={value.name} maxLength={invoiceFieldLimits.name}
              onChange={(event) => update("name", event.target.value)}
              autoComplete={value.type === "company" ? "organization" : "name"}
              className={inputClass}
            />
          </Field>

          {value.type === "company" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("checkout.taxId")} htmlFor={`${idPrefix}-billing-tax-id`} error={errors.taxId}>
                <UIInput
                  id={`${idPrefix}-billing-tax-id`} {...errorProps("taxId", "tax-id")}
                  value={value.taxId} maxLength={invoiceFieldLimits.taxId}
                  onChange={(event) => update("taxId", event.target.value)}
                  autoCapitalize="characters"
                  className={inputClass}
                />
              </Field>
              <Field label={t("checkout.registrationNumber")} htmlFor={`${idPrefix}-billing-reg`} error={errors.registrationNumber} optional>
                <UIInput
                  id={`${idPrefix}-billing-reg`} {...errorProps("registrationNumber", "reg")}
                  value={value.registrationNumber} maxLength={invoiceFieldLimits.registrationNumber}
                  onChange={(event) => update("registrationNumber", event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          <Field label={t("checkout.billingAddress")} htmlFor={`${idPrefix}-billing-address`} error={errors.address}>
            <UIInput
              id={`${idPrefix}-billing-address`} {...errorProps("address", "address")}
              value={value.address} maxLength={invoiceFieldLimits.address}
              onChange={(event) => update("address", event.target.value)}
              autoComplete="street-address"
              className={inputClass}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("checkout.billingCity")} htmlFor={`${idPrefix}-billing-city`} error={errors.city}>
              <UIInput
                id={`${idPrefix}-billing-city`} {...errorProps("city", "city")}
                value={value.city} maxLength={invoiceFieldLimits.city}
                onChange={(event) => update("city", event.target.value)}
                autoComplete="address-level2"
                className={inputClass}
              />
            </Field>
            {bucharest ? (
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-white/75">{t("checkout.billingSector")}</span>
                <ThemedSelect
                  id={`${idPrefix}-billing-sector`}
                  invalid={Boolean(errors.sector)}
                  describedBy={errors.sector ? `${idPrefix}-billing-sector-error` : undefined}
                  value={value.sector}
                  onChange={(sector) => onChange({ ...value, county: "Bucuresti", sector })}
                  options={sectors}
                  placeholder={t("checkout.sectorPlaceholder")}
                />
                {errors.sector && <p id={`${idPrefix}-billing-sector-error`} role="alert" className="mt-1.5 text-xs text-red-400">{t(errors.sector)}</p>}
              </div>
            ) : (
              <Field label={t("checkout.billingCounty")} htmlFor={`${idPrefix}-billing-county`} error={errors.county}>
                <UIInput
                  id={`${idPrefix}-billing-county`} {...errorProps("county", "county")}
                  value={value.county} maxLength={invoiceFieldLimits.county}
                  onChange={(event) => update("county", event.target.value)}
                  autoComplete="address-level1"
                  className={inputClass}
                />
              </Field>
            )}
          </div>

          {bucharest && <p className="text-xs leading-5 text-white/45">{t("checkout.bucharestAddressHint")}</p>}

          <Field label={t("checkout.billingCountry")} htmlFor={`${idPrefix}-billing-country`} error={errors.country}>
            <UIInput
              id={`${idPrefix}-billing-country`} {...errorProps("country", "country")}
              value={value.country} maxLength={invoiceFieldLimits.country}
              onChange={(event) => update("country", event.target.value)}
              autoComplete="country-name"
              className={inputClass}
            />
          </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
  error,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="mb-1.5 block text-xs font-semibold text-white/75">
        {label}{optional ? ` ${t("checkout.optional")}` : ""}
      </span>
      {children}
      {error && <span id={`${htmlFor}-error`} role="alert" className="mt-1.5 block text-xs text-red-400">{t(error)}</span>}
    </label>
  );
}
