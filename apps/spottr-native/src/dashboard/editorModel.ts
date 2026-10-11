import { eventErrors, validHttps, type EventDraft } from "./data";

export type EditorSection = "details" | "lineup" | "tickets" | "admin";
// Runtime reuse avoids importing the Next.js form's DOM-only type graph into native.
const { basicsFields, scheduleFields, getErrorDestination } =
  require("../../../pulse-app/src/features/events/form/editorSections") as {
    basicsFields: string[];
    scheduleFields: string[];
    getErrorDestination: (
      errors: Record<string, { type: string }>,
      mode: "create" | "edit",
    ) => { step: number; section: EditorSection } | undefined;
  };

export type EditorErrors = Record<string, string>;
/** Keep the original wizard's validation groups and destination precedence. */
export function editorErrors(
  draft: EventDraft,
  external: boolean,
  now = Date.now(),
): EditorErrors {
  const errors = eventErrors(draft, now);
  if (draft.title.trim().length < 3) errors.title = "formValidation.titleShort";
  if ((draft.description ?? "").trim().length < 10)
    errors.description = "formValidation.descriptionShort";
  for (const key of ["category", "city", "vibe"] as const)
    if (!draft[key]?.trim()) errors[key] = `formValidation.${key}Required`;
  if (!draft.endTime) errors.endTime = "formValidation.endRequired";
  if (external) {
    delete errors.vatPercentage;
    for (const key of Object.keys(errors))
      if (key.startsWith("ticketTypes.")) delete errors[key];
    if (
      !draft.externalTicketUrl ||
      draft.externalTicketUrl.length > 2048 ||
      !validHttps(draft.externalTicketUrl)
    )
      errors.externalTicketUrl = "ticketForm.externalUrlRequired";
  } else {
    for (const [i, ticket] of (draft.ticketTypes ?? []).entries()) {
      delete errors[`ticketTypes.${i}`];
      if (ticket.name.trim().length < 2)
        errors[`ticketTypes.${i}.name`] = "formValidation.ticketNameShort";
      if (!Number.isFinite(ticket.priceRon) || ticket.priceRon < 0)
        errors[`ticketTypes.${i}.priceRon`] = "formValidation.priceNegative";
      if (!Number.isInteger(ticket.capacity) || ticket.capacity < 1)
        errors[`ticketTypes.${i}.capacity`] = "formValidation.capacityMinimum";
      if ((ticket.description?.length ?? 0) > 1000)
        errors[`ticketTypes.${i}.description`] =
          "formValidation.descriptionLong";
      if (!Number.isFinite(Date.parse(ticket.startSales)))
        errors[`ticketTypes.${i}.startSales`] =
          "formValidation.salesStartRequired";
      if (!Number.isFinite(Date.parse(ticket.endSales)))
        errors[`ticketTypes.${i}.endSales`] = "formValidation.salesEndRequired";
      else if (!(Date.parse(ticket.endSales) > Date.parse(ticket.startSales)))
        errors[`ticketTypes.${i}.endSales`] =
          "formValidation.salesEndAfterStart";
    }
  }
  return errors;
}

export function errorsForStep(
  errors: EditorErrors,
  step: number,
): EditorErrors {
  const fields =
    step === 0
      ? [...basicsFields, "lineup"]
      : step === 1
        ? scheduleFields
        : undefined;
  return Object.fromEntries(
    Object.entries(errors).filter(
      ([key]) =>
        !fields ||
        fields.some((field) => key === field || key.startsWith(field + ".")),
    ),
  );
}

export function canAdvanceEditorStep(
  draft: EventDraft,
  external: boolean,
  step: number,
  now = Date.now(),
) {
  return (
    Object.keys(errorsForStep(editorErrors(draft, external, now), step))
      .length === 0
  );
}

export function errorDestination(errors: EditorErrors, editing: boolean) {
  const grouped = Object.fromEntries(
    Object.keys(errors).map((key) => [key.split(".")[0], { type: "validate" }]),
  );
  return getErrorDestination(grouped, editing ? "edit" : "create");
}

export function updateLineupTime<T extends { performanceTime?: string }>(
  items: T[],
  index: number,
  value: string,
): T[] {
  return items
    .map((item, i) =>
      i === index ? { ...item, performanceTime: value } : item,
    )
    .sort((a, b) =>
      (a.performanceTime || "99:99").localeCompare(
        b.performanceTime || "99:99",
      ),
    );
}
