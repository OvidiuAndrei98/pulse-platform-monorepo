import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventFormValues } from "@/app/dashboard/components/EventsForm";
import { useDataProvider } from "@/core/DataProviderContext";
import {
  eventInputClass,
  FormField,
  StepperInput,
} from "@/features/events/form/FormField";
import { DateTimePicker } from "@/features/events/form/DateTimePicker";
import {Input as UIInput} from '@/components/ui/Field';

export function TicketTypesSection({
  form,
  readOnly = false,
}: {
  form: UseFormReturn<EventFormValues>;
  readOnly?: boolean;
}) {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "ticketTypes",
  });
  const ticketTypes = form.watch("ticketTypes");
  const { errors } = form.formState;
  const [canSellPaidTickets, setCanSellPaidTickets] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  const [adding, setAdding] = useState(false);
  const organizerAbsorbsServiceFee = form.watch("organizerAbsorbsServiceFee");
  const vatPercentage = form.watch("vatPercentage");
  const ticketingMode = form.watch("ticketingMode");

  useEffect(() => {
    if (!user) return;
    user
      .getOrganizerProfile()
      .then((profile) =>
        setCanSellPaidTickets(
          Boolean(
            profile?.stripeChargesEnabled && profile?.stripePayoutsEnabled,
          ),
        ),
      )
      .catch(() => setCanSellPaidTickets(false));
  }, [user]);

  useEffect(() => {
    if (adding && fields.length) {
      setExpanded(fields[fields.length - 1].id);
      setAdding(false);
    }
  }, [adding, fields]);

  const hasPaidTickets = ticketTypes?.some((ticket) => (ticket.priceRon ?? 0) > 0) ?? false;

  const ticketingMethodSelector = (
    <fieldset disabled={readOnly} className="mt-5 grid gap-2 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">{t("ticketForm.salesMethod")}</legend>
      {(["spottr", "external"] as const).map((mode) => (
        <label
          key={mode}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-sm transition ${ticketingMode === mode ? "border-primary bg-primary/10 text-foreground" : "border-white/10 bg-white/[0.02] text-muted-foreground"}`}
        >
          <input
            type="radio"
            name="ticketing-mode"
            value={mode}
            checked={ticketingMode === mode}
            onChange={() => {
              form.setValue("ticketingMode", mode, { shouldDirty: true, shouldValidate: true });
              if (mode === "external") {
                replace([]);
                form.setValue("organizerAbsorbsServiceFee", false, { shouldDirty: true });
              }
            }}
            className="h-4 w-4 accent-primary"
          />
          {t(`ticketForm.${mode === "spottr" ? "sellOnSpottr" : "sellExternally"}`)}
        </label>
      ))}
    </fieldset>
  );

  if (ticketingMode === "external") {
    return (
      <section>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("ticketForm.title")}</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{t("ticketForm.salesMethodHint")}</p>
        </div>
        {ticketingMethodSelector}
        <div className="mt-5 rounded-xl border border-white/10 p-4">
          <FormField label={t("ticketForm.externalUrl")} error={errors.externalTicketUrl?.message}>
            <UIInput
              {...form.register("externalTicketUrl")}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://tickets.example.com/event"
              className={eventInputClass}
            />
          </FormField>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("ticketForm.externalUrlHint")}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("ticketForm.title")}
          </h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            {t("ticketForm.hint")}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              append(
                {
                  name: "",
                  priceRon: 0,
                  capacity: 50,
                  description: "",
                  startSales: "",
                  endSales: "",
                },
                { shouldFocus: false },
              );
              setAdding(true);
            }}
            title={t("ticketForm.addTypeTitle")}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary/10 px-4 text-sm font-medium text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> {t("ticketForm.addType")}
          </button>
        )}
      </div>
      {ticketingMethodSelector}
      {!canSellPaidTickets && !readOnly && (
        <p className="mt-3 text-xs leading-5 text-amber-400/90">
          {t("ticketForm.stripeRequired")}
        </p>
      )}
      <fieldset disabled={readOnly} aria-describedby="event-vat-hint event-vat-error" className="mt-5 space-y-3 rounded-xl border border-white/10 p-4">
        <legend className="px-1 text-sm font-medium">{t("ticketForm.vatLabel")}</legend>
        {([
          { value: 21, label: "ticketForm.vatStandard" },
          { value: 11, label: "ticketForm.vatReduced" },
          { value: 0, label: "ticketForm.noVat" },
        ] as const).map((option) => (
          <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm leading-5">
            <input type="radio" name="event-vat" value={option.value} checked={vatPercentage === option.value}
              aria-invalid={Boolean(errors.vatPercentage)} className="h-4 w-4 shrink-0 accent-primary"
              onChange={() => form.setValue("vatPercentage", option.value, { shouldDirty: true, shouldValidate: true })} />
            {t(option.label)}
          </label>
        ))}
        <p id="event-vat-error" role={errors.vatPercentage ? "alert" : undefined} className="text-xs text-red-400">{errors.vatPercentage?.message}</p>
        <p id="event-vat-hint" className="text-xs leading-5 text-muted-foreground">{t("ticketForm.vatHint")}</p>
      </fieldset>
      {fields.length > 0 && hasPaidTickets && (
        <fieldset disabled={readOnly} className="mt-5">
          <label className="flex cursor-pointer items-start gap-3 py-3">
            <input
              type="checkbox"
              checked={organizerAbsorbsServiceFee}
              onChange={(event) =>
                form.setValue(
                  "organizerAbsorbsServiceFee",
                  event.target.checked,
                  { shouldDirty: true },
                )
              }
              className="sr-only"
            />
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition ${organizerAbsorbsServiceFee ? "border-primary bg-primary text-primary-foreground" : "border-white/25 bg-white/[0.03]"}`}
            >
              {organizerAbsorbsServiceFee && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {t("ticketForm.absorbFee")}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {t("ticketForm.absorbFeeHint")}
              </span>
            </span>
          </label>
        </fieldset>
      )}
      {errors.ticketTypes?.message && (
        <p className="mt-2 text-xs font-medium text-red-400">
          {errors.ticketTypes.message}
        </p>
      )}
      {!fields.length && (
        <p className="py-8 text-sm text-muted-foreground">
          {t("eventEditor.noTickets")}
        </p>
      )}
      <div className="mt-4 divide-y divide-white/10">
        {fields.map((field, index) => (
          <div key={field.id} className="py-2">
            <button
              type="button"
              aria-expanded={
                expanded === field.id || Boolean(errors.ticketTypes?.[index])
              }
              aria-controls={`ticket-${field.id}`}
              onClick={() =>
                setExpanded(expanded === field.id ? undefined : field.id)
              }
              className="flex w-full items-center gap-3 py-4 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {ticketTypes?.[index]?.name || t("eventEditor.newTicket")}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {t("eventEditor.ticketSummary", {
                    price: ticketTypes?.[index]?.priceRon ?? 0,
                    count: ticketTypes?.[index]?.capacity ?? 0,
                  })}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition ${expanded === field.id || errors.ticketTypes?.[index] ? "rotate-180" : ""}`}
              />
            </button>
            <fieldset
              id={`ticket-${field.id}`}
              hidden={expanded !== field.id && !errors.ticketTypes?.[index]}
              disabled={readOnly}
              className="pb-5 pt-1"
            >
              <input
                type="hidden"
                {...form.register(`ticketTypes.${index}.id`)}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <UIInput
                    {...form.register(`ticketTypes.${index}.name`)}
                    placeholder={t("ticketForm.ticketName")}
                    className={eventInputClass}
                  />
                  {errors.ticketTypes?.[index]?.name?.message && (
                    <p className="mt-1 px-2 text-[11px] text-red-400">
                      {errors.ticketTypes[index].name.message}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="shrink-0 rounded-full p-2 text-muted-foreground/60 transition hover:bg-white/5 hover:text-red-400"
                  aria-label={t("ticketForm.deleteType")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <FormField
                  label={t("ticketForm.price")}
                  compact
                  error={errors.ticketTypes?.[index]?.priceRon?.message}
                >
                  <StepperInput
                    value={(ticketTypes?.[index]?.priceRon as number) ?? 0}
                    onChange={(value) =>
                      form.setValue(`ticketTypes.${index}.priceRon`, value, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    step={10}
                    min={0}
                    disabled={(ticketTypes?.[index]?.priceRon ?? 0) === 0 || !canSellPaidTickets}
                  />
                </FormField>
                <FormField
                  label={t("ticketForm.capacity")}
                  compact
                  error={errors.ticketTypes?.[index]?.capacity?.message}
                >
                  <StepperInput
                    value={(ticketTypes?.[index]?.capacity as number) ?? 0}
                    onChange={(value) =>
                      form.setValue(`ticketTypes.${index}.capacity`, value, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    step={10}
                    min={1}
                  />
                </FormField>
              </div>
              <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 text-sm">
                <input
                  type="checkbox"
                  checked={(ticketTypes?.[index]?.priceRon ?? 0) === 0}
                  onChange={(event) =>
                    form.setValue(
                      `ticketTypes.${index}.priceRon`,
                      event.target.checked ? 0 : 10,
                      { shouldValidate: true, shouldDirty: true },
                    )
                  }
                  disabled={!canSellPaidTickets && (ticketTypes?.[index]?.priceRon ?? 0) === 0}
                  className="h-4 w-4 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{t("ticketForm.freeTicket")}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t("ticketForm.freeTicketHint")}
                  </span>
                </span>
              </label>
              {!canSellPaidTickets && (ticketTypes?.[index]?.priceRon ?? 0) > 0 && (
                <p className="mt-2 text-xs text-amber-400/90">{t("ticketForm.configureStripePaid")}</p>
              )}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  label={t("ticketForm.salesStart")}
                  compact
                  error={errors.ticketTypes?.[index]?.startSales?.message}
                >
                  <DateTimePicker
                    value={ticketTypes?.[index]?.startSales || ""}
                    onChange={(startSales) =>
                      form.setValue(
                        `ticketTypes.${index}.startSales`,
                        startSales,
                        { shouldValidate: true, shouldDirty: true },
                      )
                    }
                    placeholder={t("ticketForm.chooseStart")}
                  />
                  <input
                    type="hidden"
                    {...form.register(`ticketTypes.${index}.startSales`)}
                  />
                </FormField>
                <FormField
                  label={t("ticketForm.salesEnd")}
                  compact
                  error={errors.ticketTypes?.[index]?.endSales?.message}
                >
                  <DateTimePicker
                    value={ticketTypes?.[index]?.endSales || ""}
                    onChange={(endSales) =>
                      form.setValue(`ticketTypes.${index}.endSales`, endSales, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    placeholder={t("ticketForm.chooseEnd")}
                  />
                  <input
                    type="hidden"
                    {...form.register(`ticketTypes.${index}.endSales`)}
                  />
                </FormField>
              </div>
              <div className="mt-3">
                <UIInput
                  {...form.register(`ticketTypes.${index}.description`)}
                  placeholder={t("ticketForm.description")}
                  className={eventInputClass}
                />
                {errors.ticketTypes?.[index]?.description?.message && (
                  <p className="mt-1 px-2 text-[11px] text-red-400">
                    {errors.ticketTypes[index].description.message}
                  </p>
                )}
              </div>
              {field.ticketsSold !== undefined && field.ticketsSold > 0 && (
                <p className="mt-2 inline-block rounded-full border border-white/[0.04] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-muted-foreground/60">
                  {t("ticketForm.soldSoFar", { count: field.ticketsSold })}
                </p>
              )}
            </fieldset>
          </div>
        ))}
      </div>
    </section>
  );
}
