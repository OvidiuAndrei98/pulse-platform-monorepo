import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { EventFormValues } from "@/app/dashboard/components/EventsForm";
import { DateTimePicker } from "./DateTimePicker";
import { FormField } from "./FormField";

export function EventPublicationSection({
  form,
  showSummary = false,
}: {
  form: UseFormReturn<EventFormValues>;
  showSummary?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const values = form.watch();
  const statuses =
    values.status === "completed"
      ? (["completed"] as const)
      : (["draft", "scheduled", "published"] as const);
  const start = values.startTime ? new Date(values.startTime) : undefined;

  return (
    <section className="space-y-5 border-t border-white/10 pt-8">
      {showSummary && (
        <div className="space-y-2 pb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("eventEditor.review")}
          </h2>
          <p className="break-words font-medium">{values.title}</p>
          <p className="text-sm text-muted-foreground">
            {[values.locationName, values.city].filter(Boolean).join(" · ")}
          </p>
          {start && !Number.isNaN(start.getTime()) && (
            <p className="text-sm text-muted-foreground">
              {new Intl.DateTimeFormat(
                i18n.language === "ro" ? "ro-RO" : "en-GB",
                { dateStyle: "medium", timeStyle: "short" },
              ).format(start)}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {t("eventEditor.ticketCount", { count: values.ticketTypes.length })}{" "}
            · {t("eventEditor.artistCount", { count: values.lineup.length })}
          </p>
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {t("eventEditor.publication")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("eventEditor.publicationHint")}
        </p>
      </div>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">{t("eventForm.eventStatus")}</legend>
        {statuses.map((status) => (
          <label
            key={status}
            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${values.status === status ? "border-primary/50 bg-primary/5 text-foreground" : "border-white/10 text-muted-foreground hover:border-white/25"}`}
          >
            <input
              type="radio"
              value={status}
              {...form.register("status")}
              className="h-4 w-4 accent-primary"
            />
            {status === "completed"
              ? t("organizerEvents.completed")
              : t(`eventForm.${status}`)}
          </label>
        ))}
      </fieldset>
      {values.status === "scheduled" && (
        <FormField
          label={t("eventForm.publishAt")}
          error={form.formState.errors.publishAt?.message}
        >
          <DateTimePicker
            value={values.publishAt || ""}
            onChange={(publishAt) =>
              form.setValue("publishAt", publishAt, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            placeholder={t("eventForm.choosePublishTime")}
          />
          <input type="hidden" {...form.register("publishAt")} />
        </FormField>
      )}
    </section>
  );
}
