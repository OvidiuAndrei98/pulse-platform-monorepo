"use client";

import { useTranslation } from "react-i18next";
import { ThemedSelect } from "@/features/events/form/ThemedSelect";

import { isPromotionBucharestAddress, type PromotionBillingDetails, type PromotionBillingFieldErrors } from './promotionBilling';
export { emptyPromotionBillingDetails, getPromotionBillingFieldErrors, validatePromotionBillingDetails, type PromotionBillingDetails, type PromotionBillingFieldErrors } from './promotionBilling';

export function PromotionBillingDetailsFields({
  value,
  onChange,
  idPrefix,
  errors = {},
}: {
  value: PromotionBillingDetails;
  onChange: (value: PromotionBillingDetails) => void;
  idPrefix: string;
  errors?: PromotionBillingFieldErrors;
}) {
  const { t } = useTranslation();
  const update = (field: keyof PromotionBillingDetails, fieldValue: string) =>
    onChange({ ...value, [field]: fieldValue });
  const inputClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3.5 text-base text-white outline-none transition placeholder:text-white/35 focus:border-primary/60 aria-[invalid=true]:border-red-400/70 sm:text-sm";
  const errorProps = (field: keyof PromotionBillingDetails, suffix: string) => ({
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": errors[field]
      ? `${idPrefix}-billing-${suffix}-error`
      : undefined,
  });
  const bucharest = isPromotionBucharestAddress(value);
  const sectors = Array.from({ length: 6 }, (_, index) => ({
    value: `Sector ${index + 1}`,
    label: `Sector ${index + 1}`,
  }));

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
      <Field
        label={t("checkout.registrationNumber")}
        htmlFor={`${idPrefix}-billing-reg`}
        optional
      >
        <input
          id={`${idPrefix}-billing-reg`}
          value={value.registrationNumber}
          onChange={(event) => update("registrationNumber", event.target.value)}
          className={inputClass}
        />
      </Field>

      <Field
        label={t("checkout.billingAddress")}
        htmlFor={`${idPrefix}-billing-address`}
        error={errors.address}
      >
        <input
          id={`${idPrefix}-billing-address`}
          {...errorProps("address", "address")}
          value={value.address}
          onChange={(event) => update("address", event.target.value)}
          autoComplete="street-address"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t("checkout.billingCity")}
          htmlFor={`${idPrefix}-billing-city`}
          error={errors.city}
        >
          <input
            id={`${idPrefix}-billing-city`}
            {...errorProps("city", "city")}
            value={value.city}
            onChange={(event) => update("city", event.target.value)}
            autoComplete="address-level2"
            className={inputClass}
          />
        </Field>
        {bucharest ? (
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-white/75">
              {t("checkout.billingSector")}
            </span>
            <ThemedSelect
              id={`${idPrefix}-billing-sector`}
              invalid={Boolean(errors.sector)}
              describedBy={errors.sector ? `${idPrefix}-billing-sector-error` : undefined}
              value={value.sector}
              onChange={(sector) => onChange({ ...value, county: "Bucuresti", sector })}
              options={sectors}
              placeholder={t("checkout.sectorPlaceholder")}
            />
            {errors.sector && (
              <p id={`${idPrefix}-billing-sector-error`} role="alert" className="mt-1.5 text-xs text-red-400">
                {t(errors.sector)}
              </p>
            )}
          </div>
        ) : (
          <Field
            label={t("checkout.billingCounty")}
            htmlFor={`${idPrefix}-billing-county`}
            error={errors.county}
          >
            <input
              id={`${idPrefix}-billing-county`}
              {...errorProps("county", "county")}
              value={value.county}
              onChange={(event) => update("county", event.target.value)}
              autoComplete="address-level1"
              className={inputClass}
            />
          </Field>
        )}
      </div>

      {bucharest && (
        <p className="text-xs leading-5 text-white/45">
          {t("checkout.bucharestAddressHint")}
        </p>
      )}

      <Field
        label={t("checkout.billingCountry")}
        htmlFor={`${idPrefix}-billing-country`}
        error={errors.country}
      >
        <input
          id={`${idPrefix}-billing-country`}
          {...errorProps("country", "country")}
          value={value.country}
          onChange={(event) => update("country", event.target.value)}
          autoComplete="country-name"
          className={inputClass}
        />
      </Field>
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
      {error && (
        <span id={`${htmlFor}-error`} role="alert" className="mt-1.5 block text-xs text-red-400">
          {t(error)}
        </span>
      )}
    </label>
  );
}
